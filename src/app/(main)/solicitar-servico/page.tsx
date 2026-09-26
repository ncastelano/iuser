// app/(main)/solicitar-servico/page.tsx
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { supabase } from '@/lib/supabase/client'
import { getCurrentPosition as getNativeCurrentPosition } from '@/lib/nativeGeolocation'
import { useTheme, ThemeColors } from '@/app/contexts/theme'
import { toast } from 'sonner'
import { addRecentServiceLocation, getRecentServiceLocations, RecentServiceLocation } from '@/lib/recentServiceLocations'
import { createSquareImage } from '@/lib/image'
import { SERVICE_TYPES, ServiceType, getServiceLabel } from '@/lib/serviceTypes'
import MyOpenServiceRequests from '@/components/MyOpenServiceRequests'
import { getAvatarUrl } from '@/lib/avatar'
import {
    Wrench,
    Briefcase,
    MapPin,
    MapPinPlus,
    CheckCircle2,
    ArrowLeft,
    Search,
    X,
    Building2,
    Camera,
    History,
    Plus,
    Store,
    Flame,
    Check,
    ChevronDown,
} from 'lucide-react'
import { Spinner } from '@/components/Spinner'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const DEFAULT_CENTER: [number, number] = [-63.9039, -8.7612] // Porto Velho

type Step = 'type' | 'where' | 'details'
type ActiveField = 'location' | null

interface Place {
    address: string
    coords: [number, number] | null
}

const STEPS: Step[] = ['type', 'where', 'details']

const MAX_PHOTOS = 20

interface PhotoItem {
    file: File
    preview: string
}

interface PublishedService {
    id: string
    kind: 'profile' | 'store'
    name: string
    description: string | null
    image_url: string | null
    service_type: string | null
    address: string | null
    lat: number | null
    lng: number | null
    viewCount: number
    createdAt: string
    ownerName: string | null
    targetSlug: string | null
    ownerAvatarUrl: string | undefined
}

// Cores e ícone de coroa dos 3 primeiros (mesmo padrão do /radar).
const RANK_COLORS: Record<number, { fill: string; stroke: string; text: string }> = {
    1: { fill: '#fbbf24', stroke: '#92400e', text: '#451a03' },
    2: { fill: '#e2e8f0', stroke: '#64748b', text: '#334155' },
    3: { fill: '#d97706', stroke: '#7c2d12', text: '#431407' },
}

function crownSvg(rank: number, size: number): string {
    const c = RANK_COLORS[rank]
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"><path d="M2.5 18.5h19l1.2-11.2-5.4 4.2L12 4 7.7 11.5 2.3 7.3z" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.4" stroke-linejoin="round"/><rect x="3" y="18.5" width="18" height="2.6" rx="1.1" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.2"/><text x="12" y="17" text-anchor="middle" font-size="8.5" font-weight="900" fill="${c.text}" font-family="system-ui,sans-serif">${rank}</text></svg>`
}

function CrownBadge({ rank, size = 26 }: { rank: number; size?: number }) {
    return <span aria-label={`Top ${rank}`} style={{ display: 'inline-block', lineHeight: 0, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.35))' }} dangerouslySetInnerHTML={{ __html: crownSvg(rank, size) }} />
}

function shortAddress(address: string): string {
    const firstPart = address.split(',')[0].trim()
    return firstPart.length > 28 ? firstPart.substring(0, 26) + '...' : firstPart
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

    // ===== FOLHA ARRASTÁVEL (sobe/desce pra ver mais, em vez de um botão) =====
    const SHEET_MIN_VH = 32
    const SHEET_DEFAULT_VH = 75
    const SHEET_MAX_VH = 94
    const [sheetHeightVh, setSheetHeightVh] = useState(SHEET_DEFAULT_VH)
    const sheetDragRef = useRef<{ startY: number; startHeightVh: number } | null>(null)
    const [isDraggingSheet, setIsDraggingSheet] = useState(false)

    const handleSheetDragStart = (clientY: number) => {
        sheetDragRef.current = { startY: clientY, startHeightVh: sheetHeightVh }
        setIsDraggingSheet(true)
    }
    const handleSheetDragMove = (clientY: number) => {
        const drag = sheetDragRef.current
        if (!drag) return
        const deltaVh = ((drag.startY - clientY) / window.innerHeight) * 100
        setSheetHeightVh(Math.min(SHEET_MAX_VH, Math.max(SHEET_MIN_VH, drag.startHeightVh + deltaVh)))
    }
    const handleSheetDragEnd = () => {
        if (!sheetDragRef.current) return
        sheetDragRef.current = null
        setIsDraggingSheet(false)
        // Encaixa no ponto mais próximo: recolhida, padrão ou expandida.
        setSheetHeightVh((h) => {
            const points = [SHEET_MIN_VH, SHEET_DEFAULT_VH, SHEET_MAX_VH]
            return points.reduce((closest, p) => Math.abs(p - h) < Math.abs(closest - h) ? p : closest, points[0])
        })
    }
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
    const [publishedServices, setPublishedServices] = useState<PublishedService[]>([])
    const [serviceSearchQuery, setServiceSearchQuery] = useState('')
    const [selectedService, setSelectedService] = useState<PublishedService | null>(null)
    const [serviceRankKey, setServiceRankKey] = useState<'views_desc' | 'views_asc' | 'recent_desc' | 'recent_asc'>('views_desc')
    const [showServiceRankMenu, setShowServiceRankMenu] = useState(false)
    const serviceMarkersRef = useRef<mapboxgl.Marker[]>([])
    const hasFitServiceBoundsRef = useRef(false)
    const [clusterItems, setClusterItems] = useState<PublishedService[] | null>(null)
    const [clusterLocation, setClusterLocation] = useState<{ lng: number; lat: number } | null>(null)

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

    // ===== SERVIÇOS DISPONÍVEIS NA PLATAFORMA =====
    // Dois tipos, unificados numa lista só: serviços publicados por pessoas no
    // ProfileDashboard (listing_type='service_offer') e serviços vendidos por
    // lojas (products.type='service', mesmo filtro que o /radar usa no modo
    // "serviços") — a loja usa sua própria localização (store_lat/store_lng).
    useEffect(() => {
        let cancelled = false
        const loadPublished = async () => {
            const [{ data: profileRows }, { data: storeRows }] = await Promise.all([
                supabase
                    .from('products')
                    .select('id, name, description, image_url, service_type, address, lat, lng, owner_id, view_count, created_at')
                    .eq('listing_type', 'service_offer')
                    .order('created_at', { ascending: false }),
                supabase
                    .from('products')
                    .select('id, name, description, image_url, store_id, view_count, created_at')
                    .eq('type', 'service')
                    .eq('listing_type', 'sale')
                    .order('created_at', { ascending: false }),
            ])
            if (cancelled) return

            const ownerIds = Array.from(new Set((profileRows || []).map((row) => row.owner_id).filter(Boolean)))
            let profilesById = new Map<string, { name: string | null; profileSlug: string | null; avatar_url: string | null }>()
            if (ownerIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, name, profileSlug, avatar_url')
                    .in('id', ownerIds)
                profilesById = new Map((profiles || []).map((p) => [p.id, p]))
            }

            const storeIds = Array.from(new Set((storeRows || []).map((row) => row.store_id).filter(Boolean)))
            let storesById = new Map<string, { name: string | null; storeSlug: string | null; logo_url: string | null; store_lat: number | null; store_lng: number | null; address: string | null }>()
            if (storeIds.length > 0) {
                const { data: stores } = await supabase
                    .from('stores')
                    .select('id, name, storeSlug, logo_url, store_lat, store_lng, address')
                    .in('id', storeIds)
                storesById = new Map((stores || []).map((s) => [s.id, s]))
            }
            if (cancelled) return

            const fromProfiles: PublishedService[] = (profileRows || []).map((row) => {
                const p = profilesById.get(row.owner_id)
                return {
                    id: row.id,
                    kind: 'profile',
                    name: row.name,
                    description: row.description,
                    image_url: row.image_url ? supabase.storage.from('product-images').getPublicUrl(row.image_url).data.publicUrl : null,
                    service_type: row.service_type,
                    address: row.address,
                    lat: row.lat,
                    lng: row.lng,
                    viewCount: row.view_count || 0,
                    createdAt: row.created_at,
                    ownerName: p?.name || null,
                    targetSlug: p?.profileSlug || null,
                    ownerAvatarUrl: getAvatarUrl(supabase, p?.avatar_url),
                }
            })

            const fromStores: PublishedService[] = (storeRows || [])
                .filter((row) => row.store_id && storesById.has(row.store_id))
                .map((row) => {
                    const s = storesById.get(row.store_id)!
                    return {
                        id: row.id,
                        kind: 'store',
                        name: row.name,
                        description: row.description,
                        image_url: row.image_url ? supabase.storage.from('product-images').getPublicUrl(row.image_url).data.publicUrl : null,
                        service_type: null,
                        address: s.address,
                        lat: s.store_lat,
                        lng: s.store_lng,
                        viewCount: row.view_count || 0,
                        createdAt: row.created_at,
                        ownerName: s.name,
                        targetSlug: s.storeSlug,
                        ownerAvatarUrl: s.logo_url ? supabase.storage.from('store-logos').getPublicUrl(s.logo_url).data.publicUrl : undefined,
                    }
                })

            setPublishedServices([...fromProfiles, ...fromStores].sort((a, b) => b.viewCount - a.viewCount))
        }
        loadPublished()
        return () => { cancelled = true }
    }, [])

    const filteredPublishedServices = (() => {
        const q = serviceSearchQuery.trim().toLowerCase()
        const matched = q
            ? publishedServices.filter((s) => s.name.toLowerCase().includes(q) || (s.ownerName || '').toLowerCase().includes(q))
            : publishedServices
        const sorted = [...matched].sort((a, b) => {
            switch (serviceRankKey) {
                case 'views_asc': return a.viewCount - b.viewCount
                case 'recent_desc': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                case 'recent_asc': return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                default: return b.viewCount - a.viewCount
            }
        })
        return sorted
    })()

    const serviceRankLabel = (key: typeof serviceRankKey) => {
        switch (key) {
            case 'views_asc': return 'Menos vistos'
            case 'recent_desc': return 'Mais recentes'
            case 'recent_asc': return 'Mais antigos'
            default: return 'Mais vistos'
        }
    }

    // Clicar num serviço voa o mapa até o local dele — não navega pra fora
    // da página, é só uma forma de explorar (igual o /radar).
    const flyToService = (service: PublishedService) => {
        setSelectedService(service)
        if (service.lat != null && service.lng != null && mapRef.current) {
            mapRef.current.flyTo({ center: [service.lng, service.lat], zoom: 16, duration: 1000 })
        }
    }

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
        setLocating(true)
        getNativeCurrentPosition(
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

    // ===== PINS DOS SERVIÇOS PUBLICADOS NA PLATAFORMA =====
    useEffect(() => {
        if (!mapReady || !mapRef.current) return
        const map = mapRef.current

        serviceMarkersRef.current.forEach((m) => m.remove())
        serviceMarkersRef.current = []

        // Sem isso os pins ficavam fora da área visível do mapa (o mapa abre
        // centralizado em Porto Velho por padrão, sem relação nenhuma com
        // onde os serviços publicados realmente estão) — só ajusta uma vez,
        // pra não ficar puxando o mapa de volta toda vez que a pessoa mexe
        // nele ou digita na busca.
        if (!hasFitServiceBoundsRef.current) {
            const withCoords = filteredPublishedServices.filter((s) => s.lat != null && s.lng != null)
            if (withCoords.length > 0) {
                hasFitServiceBoundsRef.current = true
                const bounds = new mapboxgl.LngLatBounds()
                withCoords.forEach((s) => bounds.extend([s.lng!, s.lat!]))
                map.fitBounds(bounds, { padding: { top: 140, bottom: Math.round(window.innerHeight * 0.5), left: 40, right: 40 }, maxZoom: 15, duration: 800 })
            }
        }

        // Agrupa por coordenada (arredondada) — vários serviços da mesma loja
        // caem todos no mesmo ponto. Igual o /radar: empilha um marcador por
        // item (com z-index decrescente), só o de cima fica visível, e uma
        // bolinha de contagem no topo do monte abre a lista pra escolher.
        // Rank (coroa) é sempre do índice na lista já ordenada.
        const rankOf = new Map<string, number>(filteredPublishedServices.slice(0, 3).map((s, i) => [s.id, i + 1] as [string, number]))
        const coordGroups = new Map<string, PublishedService[]>()
        filteredPublishedServices.forEach((service) => {
            if (service.lat == null || service.lng == null) return
            const key = `${service.lng.toFixed(4)},${service.lat.toFixed(4)}`
            if (!coordGroups.has(key)) coordGroups.set(key, [])
            coordGroups.get(key)!.push(service)
        })

        const serviceSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 1 4 4v1h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1V6a4 4 0 0 1 4-4Z"/><path d="M8 7V6a4 4 0 0 1 8 0v1"/></svg>`

        coordGroups.forEach((group) => {
            group.forEach((service, index) => {
                const lng = service.lng!
                const lat = service.lat!

                const el = document.createElement('div')
                const inner = document.createElement('div')

                let borderColor = '#f97316'
                const rank = rankOf.get(service.id)
                if (rank) borderColor = RANK_COLORS[rank].fill
                const boxSize = rank ? 58 : 48
                const baseZ = rank ? '600' : (100 - index).toString()
                el.style.zIndex = baseZ

                inner.style.cssText = `
                    width: ${boxSize}px;
                    height: ${boxSize}px;
                    border-radius: 12px;
                    overflow: hidden;
                    border: 3px solid ${borderColor};
                    cursor: pointer;
                    background: white;
                    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    box-shadow: ${rank ? `0 0 0 3px ${RANK_COLORS[rank].fill}55, 0 6px 20px rgba(0,0,0,0.4)` : '0 4px 15px rgba(0,0,0,0.3)'};
                `

                inner.onmouseenter = () => {
                    inner.style.transform = 'scale(1.15) rotate(3deg)'
                    inner.style.boxShadow = '0 8px 25px rgba(249,115,22,0.4)'
                    el.style.zIndex = '999'
                }
                inner.onmouseleave = () => {
                    inner.style.transform = 'scale(1) rotate(0deg)'
                    inner.style.boxShadow = rank ? `0 0 0 3px ${RANK_COLORS[rank].fill}55, 0 6px 20px rgba(0,0,0,0.4)` : '0 4px 15px rgba(0,0,0,0.3)'
                    el.style.zIndex = baseZ
                }

                if (service.image_url) {
                    const img = document.createElement('img')
                    img.src = service.image_url
                    img.style.cssText = 'width:100%;height:100%;object-fit:cover;'
                    img.onerror = () => {
                        inner.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">${serviceSvg}</div>`
                    }
                    inner.appendChild(img)
                } else {
                    inner.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">${serviceSvg}</div>`
                }

                el.appendChild(inner)

                if (rank) {
                    const crown = document.createElement('div')
                    crown.innerHTML = crownSvg(rank, 32)
                    crown.style.cssText = 'position:absolute;top:-26px;left:50%;transform:translateX(-50%);pointer-events:none;line-height:0;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.4));'
                    el.appendChild(crown)
                }

                if (index === 0 && group.length > 1) {
                    const badge = document.createElement('div')
                    badge.innerHTML = `${group.length}`
                    badge.style.cssText = `
                        position: absolute;
                        bottom: -8px;
                        right: -8px;
                        background: linear-gradient(135deg, #f97316, #ef4444);
                        color: white;
                        font-size: 10px;
                        font-weight: 900;
                        padding: 3px 8px;
                        border-radius: 20px;
                        border: 2px solid white;
                        z-index: 10;
                        cursor: pointer;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                    `
                    badge.onclick = (e) => {
                        e.stopPropagation()
                        setClusterItems(group)
                        setClusterLocation({ lng, lat })
                        map.flyTo({ center: [lng, lat], zoom: 18, duration: 600 })
                    }
                    el.appendChild(badge)
                }

                el.onclick = () => {
                    flyToService(service)
                }

                const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
                    .setLngLat([lng, lat])
                    .addTo(map)

                serviceMarkersRef.current.push(marker)
            })
        })

        return () => {
            serviceMarkersRef.current.forEach((m) => m.remove())
            serviceMarkersRef.current = []
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapReady, filteredPublishedServices])

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
        if (type !== 'outro' && !publishedServices.some((s) => s.service_type === type)) {
            toast.info('Não temos por enquanto esse serviço. Você quer adicionar esse serviço?')
        }
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
            router.push(`/login?redirect=${encodeURIComponent('/solicitar-servico')}`)
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
            <div
                ref={mapContainerRef}
                className="absolute inset-0 w-full h-full"
                style={{ background: '#111', isolation: 'isolate' }}
            />

            {/* Botão voltar flutuante */}
            <button
                onClick={handleBack}
                className="absolute top-6 left-4 z-30 w-11 h-11 rounded-full flex items-center justify-center shadow-xl"
                style={{ background: colors.surface, color: colors.textPrimary }}
            >
                <ArrowLeft size={20} />
            </button>

            {/* Serviços disponíveis, em cima do mapa (igual o widget do /radar) —
                clicar num item só voa o mapa até o local, não navega pra fora */}
            {!activeField && !submitted && filteredPublishedServices.length > 0 && (
                <div className="absolute top-6 left-20 right-4 z-20">
                    <div className="flex gap-2.5 overflow-x-auto pt-6 pb-1 scrollbar-hide snap-x items-end">
                        {filteredPublishedServices.map((service, idx) => {
                            const rank = idx < 3 ? idx + 1 : 0
                            const size = rank ? 62 : 52
                            const isSelected = selectedService?.id === service.id
                            const shape = service.kind === 'store' ? 'rounded-xl' : 'rounded-full'
                            return (
                                <button
                                    key={service.id}
                                    onClick={() => flyToService(service)}
                                    className={`snap-center flex-shrink-0 relative transition-all duration-300 ${isSelected ? 'ring-4 ring-orange-500 scale-110 shadow-xl' : 'opacity-95 hover:scale-105'}`}
                                    style={{ width: `${size}px`, height: `${size}px` }}
                                >
                                    {rank > 0 && (
                                        <span className="absolute left-1/2 -translate-x-1/2 z-10" style={{ top: -22 }}>
                                            <CrownBadge rank={rank} size={30} />
                                        </span>
                                    )}
                                    <div
                                        className={`w-full h-full ${shape} overflow-hidden shadow-md bg-white box-border`}
                                        style={{ border: `3px solid ${rank ? RANK_COLORS[rank].fill : '#fb923c'}` }}
                                    >
                                        {service.image_url ? (
                                            <img src={service.image_url} className="w-full h-full object-cover" alt="" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-xs font-black italic bg-gradient-to-br from-orange-100 to-red-100 text-orange-500">
                                                {service.name.charAt(0)}
                                            </div>
                                        )}
                                    </div>
                                </button>
                            )
                        })}
                    </div>

                    {/* Filtro (mesmo padrão do /radar): sempre em pares mais/menos */}
                    <div className="flex justify-end relative -mt-1">
                        <button
                            onClick={() => setShowServiceRankMenu((v) => !v)}
                            className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-black text-white shadow-lg"
                            style={{ background: GRADIENT, boxShadow: '0 4px 14px #f9731660' }}
                            aria-expanded={showServiceRankMenu}
                        >
                            <Flame className="w-3.5 h-3.5" />
                            Filtro: {serviceRankLabel(serviceRankKey)}
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showServiceRankMenu ? 'rotate-180' : ''}`} />
                        </button>
                        {showServiceRankMenu && (
                            <div className="absolute right-0 top-full mt-2 w-60 rounded-2xl bg-white shadow-2xl border border-orange-200 z-40 py-1.5">
                                {[
                                    { title: 'Visualizações', desc: { key: 'views_desc' as const, label: 'Mais vistos' }, asc: { key: 'views_asc' as const, label: 'Menos vistos' } },
                                    { title: 'Novidade', desc: { key: 'recent_desc' as const, label: 'Mais recentes' }, asc: { key: 'recent_asc' as const, label: 'Mais antigos' } },
                                ].map((g) => (
                                    <div key={g.title} className="px-3 py-1.5">
                                        <p className="text-[9px] font-black uppercase tracking-wider text-gray-400 mb-1">{g.title}</p>
                                        <div className="grid grid-cols-2 gap-1.5">
                                            {[g.desc, g.asc].map((opt) => {
                                                const active = serviceRankKey === opt.key
                                                return (
                                                    <button
                                                        key={opt.key}
                                                        onClick={() => { setServiceRankKey(opt.key); setShowServiceRankMenu(false) }}
                                                        className={`flex items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-bold border transition ${active ? 'text-white border-transparent' : 'text-gray-700 border-gray-200 hover:bg-orange-50'}`}
                                                        style={active ? { background: GRADIENT } : undefined}
                                                    >
                                                        {active && <Check className="w-3 h-3" />}
                                                        {opt.label}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Vários serviços no mesmo ponto (mesma loja): lista pra escolher,
                igual o cluster do /radar */}
            {clusterItems && clusterLocation && (
                <div className="absolute top-24 left-1/2 -translate-x-1/2 w-[92%] max-w-sm z-30">
                    <div className="rounded-2xl px-4 py-3 shadow-lg flex items-center justify-between" style={{ background: GRADIENT }}>
                        <div className="flex items-center gap-2">
                            <Store className="w-5 h-5 text-white" />
                            <div>
                                <p className="text-xs font-bold text-white">{clusterItems[0].ownerName}</p>
                                <p className="text-[10px] text-white/80">{clusterItems.length} serviços neste local</p>
                            </div>
                        </div>
                        <button
                            onClick={() => { setClusterItems(null); setClusterLocation(null) }}
                            className="p-1.5 bg-white/20 rounded-xl hover:bg-white/30 transition-colors"
                        >
                            <X className="w-4 h-4 text-white" />
                        </button>
                    </div>
                    <div className="mt-2 rounded-2xl shadow-xl overflow-hidden max-h-72 overflow-y-auto" style={{ background: colors.surface }}>
                        {clusterItems.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => {
                                    setSelectedService(item)
                                    setClusterItems(null)
                                    setClusterLocation(null)
                                }}
                                className="w-full p-3 flex items-center gap-3 border-b hover:opacity-80 transition-all"
                                style={{ borderColor: colors.border }}
                            >
                                <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                                    {item.image_url ? (
                                        <img src={item.image_url} className="w-full h-full object-cover" alt="" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center" style={{ color: colors.textSecondary }}>
                                            <Wrench size={16} />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 text-left min-w-0">
                                    <p className="text-sm font-semibold truncate" style={{ color: colors.textPrimary }}>{item.name}</p>
                                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                                        {item.kind === 'store' ? 'Serviço da loja' : getServiceLabel(item.service_type || 'outro')}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

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
                            {locating ? <Spinner size={16} /> : <MapPinPlus size={16} />}
                        </div>
                        <span className="text-sm font-bold" style={{ color: colors.accent }}>Usar minha localização atual</span>
                    </button>

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
                            {submitting ? <Spinner size={18} /> : <Wrench size={18} />}
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

            {/* Bottom sheet estilo Uber, por etapas — arraste a alça pra cima ou
                pra baixo pra ver mais (ou menos) sem precisar de um botão */}
            {!activeField && !submitted && (
                <div
                    className="absolute bottom-0 inset-x-0 z-20 rounded-t-3xl px-5 pt-4 pb-8 overflow-y-auto"
                    style={{
                        background: colors.surface,
                        boxShadow: '0 -8px 30px rgba(0,0,0,0.35)',
                        height: `${sheetHeightVh}vh`,
                        transition: isDraggingSheet ? 'none' : 'height 0.25s ease-out',
                    }}
                >
                    <div
                        className="w-full flex justify-center pb-3 -mt-1 touch-none cursor-grab active:cursor-grabbing"
                        onPointerDown={(e) => {
                            e.currentTarget.setPointerCapture(e.pointerId)
                            handleSheetDragStart(e.clientY)
                        }}
                        onPointerMove={(e) => handleSheetDragMove(e.clientY)}
                        onPointerUp={handleSheetDragEnd}
                        onPointerCancel={handleSheetDragEnd}
                    >
                        <div className="w-10 h-1 rounded-full" style={{ background: colors.border }} />
                    </div>

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
                            {/* Título — vira a ficha do serviço selecionado quando algum item
                                da lista de cima (ou pin do mapa) é clicado */}
                            {selectedService ? (
                                <div
                                    className="mb-3 rounded-2xl p-3 flex items-center gap-3"
                                    style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}
                                >
                                    {selectedService.image_url ? (
                                        <img src={selectedService.image_url} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" alt="" />
                                    ) : (
                                        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#fff' }}>
                                            <Wrench size={18} />
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <p className="text-xs font-black truncate" style={{ color: colors.textPrimary }}>{selectedService.name}</p>
                                            {selectedService.kind === 'store' && (
                                                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase flex-shrink-0" style={{ background: `${colors.accent}20`, color: colors.accent }}>
                                                    <Store size={9} />
                                                    Loja
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[10px]" style={{ color: colors.accent }}>
                                            {selectedService.kind === 'store' ? 'Serviço da loja' : getServiceLabel(selectedService.service_type || 'outro')}
                                        </p>
                                        <p className="text-[10px] truncate" style={{ color: colors.textSecondary }}>{selectedService.ownerName}</p>
                                    </div>
                                    <button
                                        onClick={() => selectedService.targetSlug && router.push(`/${selectedService.targetSlug}`)}
                                        className="flex-shrink-0 px-3 py-2 rounded-full text-[10px] font-black uppercase"
                                        style={{ background: GRADIENT, color: '#fff' }}
                                    >
                                        Ver
                                    </button>
                                    <button
                                        onClick={() => setSelectedService(null)}
                                        className="flex-shrink-0"
                                        style={{ color: colors.textSecondary }}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ) : (
                                <h2 className="text-lg font-black mb-3" style={{ color: colors.textPrimary }}>Qual serviço você precisa?</h2>
                            )}

                            {/* Buscar serviço, no lugar da antiga legenda "Escolha uma opção pra começar" */}
                            <div className="relative mb-3">
                                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} />
                                <input
                                    type="text"
                                    value={serviceSearchQuery}
                                    onChange={(e) => setServiceSearchQuery(e.target.value)}
                                    placeholder="Buscar serviço ou profissional..."
                                    className="w-full pl-10 pr-4 py-2.5 rounded-full text-sm focus:outline-none"
                                    style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                />
                            </div>
                            <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
                                {SERVICE_TYPES.map((type) => {
                                    const Icon = type.icon
                                    const active = serviceType === type.id
                                    return (
                                        <button
                                            key={type.id}
                                            onClick={() => handleSelectType(type.id)}
                                            className="flex-shrink-0 flex flex-col items-center gap-1.5 py-3 px-4 rounded-2xl transition-all hover:scale-[1.03] active:scale-95"
                                            style={
                                                active
                                                    ? { background: GRADIENT, color: '#fff' }
                                                    : { background: `${colors.border}30`, border: `1px solid ${colors.border}` }
                                            }
                                        >
                                            <div
                                                className="w-9 h-9 rounded-full flex items-center justify-center"
                                                style={active ? { background: 'rgba(255,255,255,0.25)', color: '#fff' } : { background: GRADIENT, color: '#fff' }}
                                            >
                                                <Icon size={18} />
                                            </div>
                                            <span className="text-[11px] font-bold text-center leading-tight whitespace-nowrap" style={{ color: active ? '#fff' : colors.textPrimary }}>
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
                                            className="flex-shrink-0 flex flex-col items-center gap-1.5 py-3 px-4 rounded-2xl transition-all hover:scale-[1.03] active:scale-95"
                                            style={
                                                active
                                                    ? { background: GRADIENT, color: '#fff' }
                                                    : { background: `${colors.border}30`, border: `1px solid ${colors.border}` }
                                            }
                                        >
                                            <div
                                                className="w-9 h-9 rounded-full flex items-center justify-center"
                                                style={active ? { background: 'rgba(255,255,255,0.25)', color: '#fff' } : { background: GRADIENT, color: '#fff' }}
                                            >
                                                <Briefcase size={18} />
                                            </div>
                                            <span className="text-[11px] font-bold text-center leading-tight capitalize whitespace-nowrap" style={{ color: active ? '#fff' : colors.textPrimary }}>
                                                {service.label}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>

                            {serviceType === 'outro' && (
                                <div className="mt-3">
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

                            {/* Meus pedidos de serviço em aberto + candidatos de cada um */}
                            <div className="mt-5">
                                <MyOpenServiceRequests limit={5} title="Meus pedidos de serviços em aberto" />
                            </div>
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
                                        {locating ? <Spinner size={16} /> : <MapPinPlus size={16} />}
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
                                {submitting ? <Spinner size={18} /> : <Wrench size={18} />}
                                Solicitar serviço
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
