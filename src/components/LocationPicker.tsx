// src/app/(main)/LocationPicker.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/app/contexts/theme'
import { MapPin, X, Check, Navigation, Search, Home, MoveVertical, Hash, FileText, AlertCircle, Car, Radio, Trash2, ChevronRight, Building2 } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { getCurrentPosition as getNativeCurrentPosition, watchPosition as watchNativePosition, GeoWatchHandle } from '@/lib/nativeGeolocation'
import { saveOwnProfile } from '@/lib/saveOwnProfile'

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
    /** Quando false, esconde o controle de sincronização de motorista mesmo com o modo ativo - usado na home, onde definir local é sobre o endereço de entrega, não sobre estar disponível pra corridas. */
    allowDriverSync?: boolean
    /** Sobre o que é a localização: a própria pessoa (padrão) ou uma loja — só muda os textos. */
    subject?: 'profile' | 'store'
    /** Deixa quem não tem conta definir um local (o chamador guarda só no aparelho). Sem isso, visitante é mandado pro login. */
    allowGuest?: boolean
    /** Quando passado, a localização salva ganha o botão "Remover localização" (pra recomeçar do zero). O chamador apaga de onde ela está guardada. */
    onClear?: () => void | Promise<void>
    /** Primeira etapa: a pessoa escolhe entre aparecer no Radar ou só guardar o endereço para os pedidos nas lojas (grava profiles.show_on_map).
     *  Só vale pra localização da PESSOA, logada. Use onde "definir local" é do perfil (home, Radar, Informações do Perfil). */
    askRadarVisibility?: boolean
}


// ===== SUGESTÕES ENQUANTO ESCREVE (um campo só) =====
// O campo de endereço é UM só, livre ("Av. Calama 1234, Porto Velho", "Hospital 9 de Julho", "Porto Velho Shopping"); enquanto a pessoa escreve aparecem lugares e endereços sugeridos.
// Fonte principal: Mapbox SEARCH BOX (mesmo token do resto do app; conhece estabelecimentos — hospitais, mercados, lojas, shoppings — o que o Geocoding comum não faz em Porto Velho).
// A busca vira uma "sessão" (o token de sessão liga as sugestões à escolha final; é assim que o Mapbox cobra). Se o Search Box falhar, cai no Geocoding de sempre.
type PlaceKind = 'poi' | 'address' | 'area'
interface PlaceSuggestion {
    id: string
    /** nome do lugar (o estabelecimento, a rua, o bairro) */
    title: string
    /** o resto do endereço (bairro, cidade, estado) */
    sub: string
    label: string
    kind: PlaceKind
    /** o Search Box só dá a posição ao escolher (retrieve); o Geocoding de reserva já traz */
    lat?: number
    lng?: number
}

const kindOf = (t: string): PlaceKind => (t === 'poi' ? 'poi' : t === 'address' || t === 'street' ? 'address' : 'area')
const cleanBR = (v: string) => v.replace(/,\s*Brasil$/i, '')

async function fetchGeocodingSuggestions(q: string, token: string, near?: { lat: number; lng: number } | null): Promise<PlaceSuggestion[]> {
    try {
        const prox = near ? `&proximity=${near.lng},${near.lat}` : ''
        const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${token}&language=pt&limit=6&country=br&autocomplete=true&types=address,poi,neighborhood,locality,place${prox}`)
        if (!res.ok) return []
        const data = await res.json()
        return (data.features || []).map((f: any, i: number): PlaceSuggestion => {
            const title = String(f.text || '')
            const full = String(f.place_name || title)
            const sub = full.startsWith(title) ? full.slice(title.length).replace(/^,\s*/, '') : full
            const type = String((f.place_type || [])[0] || '')
            return { id: `g-${f.id}-${i}`, title, sub: cleanBR(sub), label: full, kind: type === 'poi' ? 'poi' : type === 'address' ? 'address' : 'area', lng: f.center?.[0], lat: f.center?.[1] }
        }).filter((x: PlaceSuggestion) => Number.isFinite(x.lat) && Number.isFinite(x.lng) && x.title)
    } catch {
        return []
    }
}

/** Sugestões para o que foi escrito. `near` puxa os resultados para perto de onde a pessoa está. Falha = lista vazia, nunca erro na tela. */
async function fetchPlaceSuggestions(text: string, near: { lat: number; lng: number } | null | undefined, session: string): Promise<PlaceSuggestion[]> {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    const q = text.trim()
    if (!token || q.length < 3) return []
    try {
        const prox = near ? `&proximity=${near.lng},${near.lat}` : ''
        const res = await fetch(`https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(q)}&access_token=${token}&session_token=${session}&language=pt&country=br&limit=8&types=poi,address,street,neighborhood,locality,place${prox}`)
        if (!res.ok) return fetchGeocodingSuggestions(q, token, near)
        const data = await res.json()
        const list: PlaceSuggestion[] = (data.suggestions || []).map((s: any): PlaceSuggestion => {
            const kind = kindOf(String(s.feature_type || ''))
            const where = cleanBR(String(s.place_formatted || ''))
            // estabelecimento: "rua, número, bairro, cidade"; o resto: só bairro, cidade e estado
            const sub = kind === 'poi' ? cleanBR(String(s.full_address || [s.address, s.place_formatted].filter(Boolean).join(', '))) : where
            return { id: String(s.mapbox_id), title: String(s.name || ''), sub, label: cleanBR(String(s.full_address || `${s.name}, ${where}`)), kind }
        }).filter((x: PlaceSuggestion) => x.id && x.title)
        return list.length > 0 ? list : fetchGeocodingSuggestions(q, token, near)
    } catch {
        return fetchGeocodingSuggestions(q, token, near)
    }
}

/** Ao escolher uma sugestão do Search Box: a posição e o nome final (fecha a sessão de busca) */
async function retrievePlace(sg: PlaceSuggestion, session: string): Promise<{ lat: number; lng: number; label: string } | null> {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) return null
    try {
        const res = await fetch(`https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(sg.id)}?access_token=${token}&session_token=${session}&language=pt`)
        if (!res.ok) return null
        const f = (await res.json()).features?.[0]
        const [lng, lat] = f?.geometry?.coordinates || []
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
        const p = f.properties || {}
        const full = cleanBR(String(p.full_address || [p.address, p.place_formatted].filter(Boolean).join(', ') || sg.label))
        // estabelecimento mostra o nome na frente do endereço ("Hospital de Base Dr. Ary Pinheiro, Rua ..., Porto Velho")
        const label = sg.kind === 'poi' && p.name && !full.startsWith(String(p.name)) ? `${p.name}, ${full}` : full
        return { lat, lng, label }
    } catch {
        return null
    }
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

const ORANGE = '#f97316'

export default function LocationPicker({ initialLocation, onSave, onClose, allowDriverSync = true, subject = 'profile', allowGuest = false, onClear, askRadarVisibility = false }: LocationPickerProps) {
    const isStore = subject === 'store'
    const { colors } = useTheme()
    const router = useRouter()

    const { userId, isLoggedIn: isLoggedInCtx, loading: profileLoading } = useProfile()
    const isAuthenticated = isLoggedInCtx || allowGuest
    const authChecked = !profileLoading

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
    const [confirmClear, setConfirmClear] = useState(false)
    const [clearing, setClearing] = useState(false)
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

    // ===== ETAPAS (mesmo padrão do CatalogBag: uma pergunta por vez) =====
    // 'choose' pergunta como a pessoa quer definir o local (escrever ou
    // marcar no mapa); 'address' mostra a busca/mapa; 'number' e
    // 'complement' vêm depois, em sequência, só depois do endereço definido.
    // Com askRadarVisibility (e logada), a ÚLTIMA etapa (depois do complemento) é a pergunta "aparecer no Radar ou só salvar o endereço".
    const askVisibility = askRadarVisibility && !isStore && !!userId
    // DUAS etapas (10/11/2026; antes eram 4–5 + uma confirmação): 'address' = ONDE FICA (a busca já aberta, com "Usar minha localização" e
    // "Marcar no mapa" ao lado) e 'details' = número, complemento e (se for o caso) aparecer no Radar, salvando direto.
    const [step, setStep] = useState<'visibility' | 'choose' | 'address' | 'number' | 'complement' | 'details'>('address')
    const [radarChoice, setRadarChoice] = useState<boolean | null>(null)
    const [savingChoice, setSavingChoice] = useState(false)
    // o que a pessoa já tinha escolhido (se já tem localização salva, vem marcado)
    useEffect(() => {
        if (!askVisibility || !userId) return
        let cancelled = false
        supabase.from('profiles').select('show_on_map').eq('id', userId).maybeSingle().then(({ data }) => {
            if (!cancelled && data && initialLocation) setRadarChoice(!!(data as any).show_on_map)
        })
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [askVisibility, userId])
    const totalSteps = askVisibility ? 5 : 4
    const stepNo = (n: number) => n
    const [method, setMethod] = useState<'search' | 'map' | null>('search')
    // Enquanto busca o GPS do aparelho antes de abrir o mapa (só quando não
    // há localização salva pra centralizar nela) - sem isso o mapa abriria
    // sempre no mesmo ponto fixo (Brasília), em vez de onde a pessoa está.
    const [resolvingMapEntry, setResolvingMapEntry] = useState(false)

    // "Marcar no mapa" pergunta antes onde a pessoa está, só pra abrir o mapa perto dela e
    // mostrar um lugar melhor pra marcar. Essa posição não é salva em lugar nenhum.
    const [askLocationForMap, setAskLocationForMap] = useState(false)

    const chooseMethod = useCallback((m: 'search' | 'map') => {
        setMethod(m)
        if (m === 'map') {
            setAskLocationForMap(true)
            return
        }
        setStep('address')
    }, [])

    // Aceitou: abre o mapa já na posição atual (o pino laranja começa onde ela está)
    const useCurrentPositionForMap = useCallback(() => {
        setAskLocationForMap(false)
        setResolvingMapEntry(true)
        getNativeCurrentPosition(
            (pos) => {
                setSelectedPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude })
                setResolvingMapEntry(false)
                setStep('address')
            },
            () => {
                // sem permissão/indisponível: segue com a localização salva ou o ponto padrão
                setResolvingMapEntry(false)
                setStep('address')
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
        )
    }, [])

    // "Procurar para mim": acha a posição do aparelho e já mostra no mapa, com o pino nela (a pessoa só confere e segue)
    const locateMe = useCallback(() => {
        setMethod('map')
        setError('')
        setResolvingMapEntry(true)
        getNativeCurrentPosition(
            (pos) => {
                setSelectedPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude })
                setResolvingMapEntry(false)
                setStep('address')
            },
            () => {
                // Sem achar a posição, não abre o mapa num ponto qualquer: volta pras opções com o aviso
                setResolvingMapEntry(false)
                setMethod('search')
                setStep('address')
                setError('Não consegui achar sua localização. Libere o acesso ao local no aparelho, ou escreva o endereço / marque no mapa.')
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        )
    }, [])

    // Recusou: abre o mapa onde já estaria (localização salva ou ponto padrão)
    const skipCurrentPositionForMap = useCallback(() => {
        setAskLocationForMap(false)
        setStep('address')
    }, [])

    // ===== SINCRONIZAÇÃO DE LOCALIZAÇÃO PARA MOTORISTA =====
    // Só aparece pra quem já aceitou um plano de tarifa em /painel-motorista
    // (ou seja, já existe uma linha em driver_pricing) E já ativou o modo
    // motorista por lá - sem isso, alguém que nunca ativou o modo via
    // duplicidade acabava vendo esse controle de qualquer forma.
    const [isDriver, setIsDriver] = useState(false)
    const [driverModeActive, setDriverModeActive] = useState(false)
    const [liveLocationSync, setLiveLocationSync] = useState(false)
    const [savingSync, setSavingSync] = useState(false)
    const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false)

    useEffect(() => {
        if (!isAuthenticated) return

        const loadDriverSync = async () => {
            if (!userId) return

            const { data } = await supabase
                .from('driver_pricing')
                .select('live_location_sync, driver_mode_active')
                .eq('driver_id', userId)
                .maybeSingle()

            if (data) {
                setIsDriver(true)
                setDriverModeActive(!!data.driver_mode_active)
                setLiveLocationSync(!!data.live_location_sync)
            }
        }

        loadDriverSync()
    }, [isAuthenticated, userId])

    // live_location_sync sozinho não basta - sem o modo motorista ativo,
    // nenhum comportamento de "ao vivo" (rastreamento, rótulo, mapa) deve
    // rodar, mesmo que o valor tenha ficado true no banco de antes.
    const effectiveLiveSync = liveLocationSync && driverModeActive

    // Clicar em "Sincronização para motorista" (só visível com o modo já
    // ativo) pergunta se quer desativar o modo motorista - não é mais um
    // toggle direto de live_location_sync, já que esse controle representa
    // "estou ativo como motorista agora".
    const handleDeactivateDriverMode = useCallback(async () => {
        setSavingSync(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { error } = await supabase
                .from('driver_pricing')
                .update({ driver_mode_active: false, live_location_sync: false })
                .eq('driver_id', user.id)

            if (error) throw error
            setDriverModeActive(false)
            setShowDeactivateConfirm(false)
        } catch (err) {
            console.error('Erro ao desativar modo motorista:', err)
        } finally {
            setSavingSync(false)
        }
    }, [])

    // ===== CONFIRMATION DIALOG STATE =====
    const [showConfirmDialog, setShowConfirmDialog] = useState(false)
    const [pendingLocation, setPendingLocation] = useState<{
        lat: number;
        lng: number;
        address: string;
        addressNumber: string;
        addressComplement: string;
    } | null>(null)

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

    // ===== RASTREAMENTO AO VIVO ENQUANTO "SINCRONIZAÇÃO PARA MOTORISTA" ESTÁ LIGADA =====
    // O toggle acima só controla o envio em background (driver_pricing.live_lat/lng,
    // feito globalmente pelo DriverLiveLocationBroadcaster) — sem isso aqui, o mapa
    // deste picker nunca se move sozinho. Mesmo padrão usado em
    // /aceitar-corridas (watchPosition contínuo) pra mostrar a posição em tempo real.
    const liveWatchIdRef = useRef<GeoWatchHandle | null>(null)

    useEffect(() => {
        if (!effectiveLiveSync || !mapReady) return

        liveWatchIdRef.current = watchNativePosition(
            (pos) => {
                const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude }
                setSelectedPosition(newPos)

                if (movableMarkerRef.current && mapInstanceRef.current) {
                    const map = mapInstanceRef.current
                    movableMarkerRef.current.setLatLng([newPos.lat, newPos.lng])
                    // Só recentraliza se a posição saiu da área visível — evita o
                    // mapa ficando se mexendo a cada atualização de GPS. Marca
                    // isMovingRef antes: sem isso o listener "moveend" (feito pra
                    // arraste manual) trata esse pan programático como manual e
                    // reaciona o estado de "carregando endereço" e a linha
                    // pontilhada a cada correção de posição.
                    if (!map.getBounds().contains([newPos.lat, newPos.lng])) {
                        isMovingRef.current = true
                        map.panTo([newPos.lat, newPos.lng], { animate: true })
                    }
                }

                if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
                setError('')
                debounceTimerRef.current = setTimeout(async () => {
                    // Sem setResolvingAddress aqui: no modo ao vivo o endereço só
                    // troca de texto quando o novo já está pronto, sem o estado de
                    // "carregando" piscando e desmontando os campos de número/
                    // complemento a cada atualização.
                    const result = await reverseGeocode(newPos.lat, newPos.lng)
                    setNewAddress(result.fullAddress)
                    if (result.extractedNumber && !newNumber) {
                        setNewNumber(result.extractedNumber)
                    }
                }, 500)
            },
            () => { /* sem permissão: mapa fica na última posição conhecida */ },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
        )

        return () => {
            if (liveWatchIdRef.current != null) {
                liveWatchIdRef.current.clear()
                liveWatchIdRef.current = null
            }
        }
    }, [effectiveLiveSync, mapReady, newNumber])

    // Enquanto sincronizado, esconde o marcador/linha da localização salva —
    // o mapa mostra só a posição atual. Os dados salvos continuam intactos
    // (savedPosition/savedAddress), só a exibição é que some; ao desligar a
    // sincronização, eles voltam a aparecer.
    useEffect(() => {
        const map = mapInstanceRef.current
        if (!mapReady || !map) return

        if (savedMarkerRef.current) {
            if (effectiveLiveSync) {
                map.removeLayer(savedMarkerRef.current)
            } else if (!map.hasLayer(savedMarkerRef.current)) {
                savedMarkerRef.current.addTo(map)
            }
        }
        if (polylineRef.current) {
            if (effectiveLiveSync) {
                map.removeLayer(polylineRef.current)
                polylineRef.current = null
            }
        }
    }, [effectiveLiveSync, mapReady])

    // ===== FLY TO =====
    const flyTo = useCallback((lat: number, lng: number) => {
        if (!mapInstanceRef.current || !movableMarkerRef.current) return

        isMovingRef.current = true
        mapInstanceRef.current.flyTo([lat, lng], 16, { duration: 0.8 })
        movableMarkerRef.current.setLatLng([lat, lng])
        updatePolyline(mapInstanceRef.current, savedPosition, { lat, lng })
    }, [savedPosition, updatePolyline])

    // ===== PERFORM SEARCH =====
    const performSearch = useCallback(async (query: string) => {
        if (!query.trim()) return

        setLoading(true)
        setError('')

        const result = await geocodeAddress(query.trim())

        if (result) {
            setSelectedPosition({ lat: result.lat, lng: result.lng })
            setNewAddress(result.address)
            flyTo(result.lat, result.lng)
            setSearchQuery('')
        } else {
            setError('Endereço não encontrado.')
        }

        setLoading(false)
    }, [flyTo])

    // ===== SUGESTÕES ENQUANTO ESCREVE =====
    const [suggs, setSuggs] = useState<PlaceSuggestion[]>([])
    const [suggsLoading, setSuggsLoading] = useState(false)
    const suggTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const suggSeqRef = useRef(0)
    // uma "sessão de busca" do Mapbox vai das primeiras letras até a escolha; depois da escolha começa outra
    const searchSessionRef = useRef<string>('')
    const searchSession = () => (searchSessionRef.current ||= (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`))

    const askSuggestions = useCallback((text: string) => {
        if (suggTimerRef.current) clearTimeout(suggTimerRef.current)
        if (text.trim().length < 3) { suggSeqRef.current++; setSuggs([]); setSuggsLoading(false); return }
        setSuggsLoading(true)
        const seq = ++suggSeqRef.current
        suggTimerRef.current = setTimeout(async () => {
            // sem local salvo, as sugestões se aproximam de Porto Velho (o mesmo ponto de partida do radar); é só uma preferência, as de outras cidades continuam aparecendo
            const list = await fetchPlaceSuggestions(text, savedPosition || { lat: -8.7612, lng: -63.9004 }, searchSession())
            if (seq !== suggSeqRef.current) return   // chegou uma digitação mais nova: descarta esta resposta
            setSuggs(list)
            setSuggsLoading(false)
        }, 300)
    }, [savedPosition])

    const pickSuggestion = useCallback(async (sg: PlaceSuggestion) => {
        suggSeqRef.current++
        setSuggs([])
        setSuggsLoading(false)
        setError('')
        let pos = Number.isFinite(sg.lat) && Number.isFinite(sg.lng) ? { lat: sg.lat as number, lng: sg.lng as number, label: sg.label } : null
        if (!pos) {
            setLoading(true)
            pos = await retrievePlace(sg, searchSession())
            setLoading(false)
            searchSessionRef.current = ''   // a escolha fecha a sessão
        } else {
            searchSessionRef.current = ''
        }
        if (!pos) { setError('Não consegui abrir esse lugar. Tente outro.'); return }
        setSearchQuery('')
        setSelectedPosition({ lat: pos.lat, lng: pos.lng })
        setNewAddress(pos.label)
        flyTo(pos.lat, pos.lng)
    }, [flyTo])

    // "Ir" / Enter: usa a 1ª sugestão que está na tela; se ainda não chegou nenhuma, busca o texto na hora (como sempre foi)
    const submitSearch = useCallback(() => {
        if (suggs.length > 0) { void pickSuggestion(suggs[0]); return }
        performSearch(searchQuery)
    }, [suggs, pickSuggestion, performSearch, searchQuery])

    // 🗺️ INICIALIZAR MAPA
    const initializeMap = useCallback(async () => {
        if (initializedRef.current || !mapContainerRef.current || !authChecked || !isAuthenticated) {
            return
        }

        initializedRef.current = true

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
            initializedRef.current = false
        }
    }, [selectedPosition, savedPosition, newNumber, authChecked, isAuthenticated])

    // O mapa só é montado quando o método escolhido é "marcar no mapa" - pra
    // "escrever endereço" não faz sentido nem baixar o Leaflet nem mostrar
    // um endereço padrão vindo de um mapa que a pessoa nunca pediu pra ver.
    useEffect(() => {
        if (step !== 'address' || method !== 'map' || !authChecked || !isAuthenticated || !mapContainerRef.current) {
            return
        }

        const timer = setTimeout(() => {
            if (!initializedRef.current) {
                initializeMap()
            }
        }, 200)

        return () => clearTimeout(timer)
    }, [step, method, authChecked, isAuthenticated, initializeMap])

    // O container do mapa só existe no DOM enquanto a etapa é 'address' e o
    // método é "mapa" (ver JSX mais abaixo) - ao sair daí, o container
    // antigo é desmontado e o Leaflet fica órfão. Zera o guard de
    // inicialização aqui pra que, voltando, um mapa novo seja montado no
    // container novo - sem isso, o mapa fica em branco na segunda vez.
    useEffect(() => {
        if ((step === 'address' && method === 'map') || !initializedRef.current) return
        initializedRef.current = false
        mapInstanceRef.current = null
        movableMarkerRef.current = null
        savedMarkerRef.current = null
        polylineRef.current = null
        setMapReady(false)
    }, [step, method])

    // ===== HANDLE SAVE WITH CONFIRMATION =====
    const handleSaveWithConfirmation = useCallback(() => {
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

        // Salvar dados temporários para confirmação
        setPendingLocation({
            lat: selectedPosition.lat,
            lng: selectedPosition.lng,
            address: fullAddressWithDetails,
            addressNumber: newNumber,
            addressComplement: newComplement
        })
        setShowConfirmDialog(true)
    }, [newNumber, newAddress, newComplement, selectedPosition])

    // ===== SALVAR DIRETO (a etapa de detalhes já mostra o resumo: sem a janela de "Confirmar localização") =====
    const saveNow = useCallback(async () => {
        if (!newNumber.trim()) { setNumberError('Escreva o número (ou toque em "Sem número")'); return }
        if (askVisibility && radarChoice === null) { setError('Escolha se você quer aparecer no Radar'); return }
        setNumberError(''); setError('')
        let full = newAddress
        if (newNumber && !/^s\/?n$/i.test(newNumber.trim()) && !newAddress.includes(newNumber)) {
            const i = full.indexOf(',')
            if (i !== -1) full = full.slice(0, i) + `, ${newNumber}` + full.slice(i)
        }
        const loc = { lat: selectedPosition.lat, lng: selectedPosition.lng, address: full, addressNumber: newNumber, addressComplement: newComplement }
        if (askVisibility && userId && radarChoice !== null) {
            setSavingChoice(true)
            await saveOwnProfile(supabase, userId, radarChoice ? { show_on_map: true, show_location: true } : { show_on_map: false })
            setSavingChoice(false)
        }
        onSave(loc)
    }, [newNumber, newAddress, newComplement, selectedPosition, askVisibility, radarChoice, userId, onSave])

    // ===== ETAPA 3 -> 4: exige número antes de deixar seguir pro complemento =====
    const handleContinueToComplement = useCallback(() => {
        if (!newNumber.trim()) {
            setNumberError('O número é obrigatório')
            return
        }
        setNumberError('')
        setStep('complement')
    }, [newNumber])

    // ===== CONFIRM SAVE =====
    const confirmSave = useCallback(async () => {
        if (pendingLocation) {
            // Escolheu aparecer no Radar: liga o mapa (e o perfil, que é a chave geral). Só guardar o endereço: fica oculto no Radar.
            if (askVisibility && userId && radarChoice !== null) {
                setSavingChoice(true)
                await saveOwnProfile(supabase, userId, radarChoice ? { show_on_map: true, show_location: true } : { show_on_map: false })
                setSavingChoice(false)
            }
            onSave(pendingLocation)
            setShowConfirmDialog(false)
            setPendingLocation(null)
        }
    }, [pendingLocation, onSave, askVisibility, userId, radarChoice])

    // ===== CANCEL CONFIRMATION =====
    const cancelConfirmation = useCallback(() => {
        setShowConfirmDialog(false)
        setPendingLocation(null)
    }, [])

    if (!authChecked) {
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
                    <Spinner size={32} color={colors.accent} />
                    <p className="text-sm font-medium" style={{ color: colors.textPrimary }}>
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

    // "Remover localização" (só quando o chamador passa onClear, ou seja, já existe uma localização salva): aparece na 1ª etapa e na etapa do endereço salvo
    const clearControl = onClear ? (

                confirmClear ? (
                    <div className="mt-2.5 flex flex-col gap-2">
                        <p className="text-[11px] font-semibold" style={{ color: colors.textPrimary }}>
                            Remover a localização salva? Você pode definir outra quando quiser.
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setConfirmClear(false)}
                                disabled={clearing}
                                className="flex-1 py-1.5 rounded-full text-[11px] font-bold border"
                                style={{ borderColor: colors.border, color: colors.textPrimary }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={async () => {
                                    setClearing(true)
                                    try { await onClear() } finally { setClearing(false); setConfirmClear(false) }
                                }}
                                disabled={clearing}
                                className="flex-1 py-1.5 rounded-full text-[11px] font-bold text-white flex items-center justify-center gap-1 disabled:opacity-60"
                                style={{ background: '#ef4444' }}
                            >
                                {clearing ? <Spinner size={12} color="#ffffff" /> : <Trash2 size={12} />}
                                Remover
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => setConfirmClear(true)}
                        className="mt-2 flex items-center gap-1 text-[11px] font-bold"
                        style={{ color: '#ef4444' }}
                    >
                        <Trash2 size={12} />
                        Remover localização
                    </button>
                )
    ) : null

    const pill = (primary: boolean) => (primary
        ? { background: ORANGE, color: '#ffffff' }
        : { background: `${colors.border}40`, color: colors.textPrimary })
    const field = { background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }
    const head = (n: number, title: string) => (
        <div className="flex items-start gap-3 mb-3">
            <span className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${ORANGE}1f`, color: ORANGE }}><MapPin size={19} /></span>
            <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>{isStore ? 'Localização da loja' : 'Sua localização'} · {n} de 2</p>
                <p className="text-[17px] font-black leading-tight" style={{ color: colors.textPrimary }}>{title}</p>
            </div>
            <button onClick={onClose} aria-label="Fechar" className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary }}><X size={16} /></button>
        </div>
    )

    // em PORTAL no body e acima da barra do app: desenhado dentro da página ele ficava por baixo da barra de baixo da 3.0 (a página tem a
    // própria camada) e preso em ancestrais com desfoque
    if (typeof document === 'undefined') return null
    return createPortal(
        <>
            <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center sm:p-4" style={{ background: 'rgba(0,0,0,.5)' }} role="dialog" aria-modal="true" aria-label="Definir localização">
                <div
                    className="w-full sm:max-w-lg rounded-t-[28px] sm:rounded-[28px] px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))] max-h-[92dvh] overflow-y-auto"
                    style={{ background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary, boxShadow: '0 -16px 40px rgba(0,0,0,.25)', marginBottom: 'var(--staging-banner-h, 0px)' }}
                >
                    <div className="flex justify-center mb-2 sm:hidden"><span className="w-10 h-1.5 rounded-full" style={{ background: colors.border }} /></div>

                    {/* ===== 1 DE 2 · ONDE FICA (busca já aberta; GPS e mapa ao lado) ===== */}
                    {step === 'address' && (
                        <>
                            {head(1, isStore ? 'Onde fica a loja?' : 'Onde você está?')}

                            {savedAddress && method === 'search' && !newAddress && (
                                <div className="rounded-2xl px-3 py-2.5 mb-3" style={field}>
                                    <p className="text-[10.5px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>Localização salva</p>
                                    <p className="text-[13px] font-bold leading-snug mt-0.5">{savedAddress}{savedNumber ? `, ${savedNumber}` : ''}</p>
                                    {savedComplement && <p className="text-[11.5px] mt-0.5" style={{ color: colors.textSecondary }}>{savedComplement}</p>}
                                    {clearControl}
                                </div>
                            )}

                            {askLocationForMap ? (
                                <div className="rounded-2xl p-3.5 mb-3" style={field}>
                                    <p className="text-[14px] font-black">Abrir o mapa perto de você?</p>
                                    <p className="text-[12px] mt-1 leading-snug" style={{ color: colors.textSecondary }}>Usamos sua posição só para centralizar o mapa; ela não é salva.</p>
                                    <div className="flex gap-2 mt-3">
                                        <button onClick={skipCurrentPositionForMap} className="flex-1 h-11 rounded-full text-[13px] font-black" style={pill(false)}>Agora não</button>
                                        <button onClick={useCurrentPositionForMap} className="flex-1 h-11 rounded-full text-[13px] font-black flex items-center justify-center gap-1.5" style={pill(true)}><Navigation size={14} />Sim</button>
                                    </div>
                                </div>
                            ) : resolvingMapEntry ? (
                                <div className="flex flex-col items-center gap-2 py-8">
                                    <Spinner size={24} color={ORANGE} />
                                    <p className="text-[13px] font-bold" style={{ color: colors.textSecondary }}>Achando onde você está...</p>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 gap-2 mb-3">
                                        <button onClick={locateMe} className="h-11 rounded-full text-[12.5px] font-black flex items-center justify-center gap-1.5 active:scale-95 transition" style={pill(true)}>
                                            <Navigation size={14} />Usar minha localização
                                        </button>
                                        <button onClick={() => (method === 'map' ? setMethod('search') : chooseMethod('map'))} className="h-11 rounded-full text-[12.5px] font-black flex items-center justify-center gap-1.5 active:scale-95 transition" style={pill(false)}>
                                            {method === 'map' ? <><Search size={14} />Escrever endereço</> : <><MapPin size={14} />Marcar no mapa</>}
                                        </button>
                                    </div>

                                    {method === 'search' && (
                                        <>
                                            <div className="flex items-center gap-2 h-12 rounded-full pl-3.5 pr-1.5 mb-2" style={field}>
                                                <Search size={16} style={{ color: colors.textSecondary }} />
                                                <input
                                                    type="text"
                                                    value={searchQuery}
                                                    onChange={(e) => { setSearchQuery(e.target.value); askSuggestions(e.target.value) }}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitSearch() } }}
                                                    placeholder="Rua e número, bairro ou um lugar"
                                                    aria-label="Endereço"
                                                    className="flex-1 min-w-0 bg-transparent outline-none text-[14px]"
                                                    style={{ color: colors.textPrimary }}
                                                    disabled={loading}
                                                    autoFocus
                                                />
                                                <button onClick={submitSearch} disabled={loading || !searchQuery.trim()} className="h-9 px-4 rounded-full text-[13px] font-black disabled:opacity-40" style={pill(true)}>
                                                    {loading ? '...' : 'Ir'}
                                                </button>
                                            </div>
                                            {/^\d{1,7}$/.test(searchQuery.trim()) && (
                                                <p className="text-[11.5px] leading-snug mb-2 px-3 py-2 rounded-2xl" style={{ background: `${ORANGE}14`, border: `1px solid ${ORANGE}40` }}>
                                                    Só o número acha uma rua qualquer. Escreva o nome da rua junto: <b>{searchQuery.trim()} Nome da rua</b>.
                                                </p>
                                            )}
                                            {(suggsLoading || suggs.length > 0) && (
                                                <div className="rounded-2xl overflow-hidden mb-3" style={field}>
                                                    {suggsLoading && suggs.length === 0 && <p className="px-3.5 py-3 text-[12px]" style={{ color: colors.textSecondary }}>Buscando...</p>}
                                                    {suggs.map((sg, i) => (
                                                        <button key={sg.id} type="button" onClick={() => pickSuggestion(sg)} className="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left active:opacity-70" style={{ borderTop: i ? `1px solid ${colors.border}` : undefined }}>
                                                            {sg.kind === 'poi' ? <Building2 size={15} className="mt-0.5 flex-shrink-0" style={{ color: '#2563eb' }} /> : <MapPin size={15} className="mt-0.5 flex-shrink-0" style={{ color: ORANGE }} />}
                                                            <span className="min-w-0">
                                                                <span className="block text-[13px] font-black leading-snug truncate">{sg.title}</span>
                                                                {sg.sub && <span className="block text-[11.5px] leading-snug truncate" style={{ color: colors.textSecondary }}>{sg.sub}</span>}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {method === 'map' && (
                                        <>
                                            <p className="text-[12.5px] font-bold mb-2" style={{ color: colors.textSecondary }}>Toque no mapa ou arraste o pino laranja</p>
                                            <div className="relative w-full h-52 sm:h-60 rounded-2xl overflow-hidden mb-3" style={{ border: `1px solid ${colors.border}`, background: colors.surface }}>
                                                <div ref={mapContainerRef} className="w-full h-full" />
                                                {!mapReady && <div className="absolute inset-0 flex items-center justify-center" style={{ background: colors.surface }}><Spinner size={24} color={ORANGE} /></div>}
                                            </div>
                                        </>
                                    )}
                                </>
                            )}

                            {allowDriverSync && isDriver && driverModeActive && (
                                <button onClick={() => setShowDeactivateConfirm(true)} disabled={savingSync} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl mb-3 disabled:opacity-60" style={{ background: '#22c55e18', border: '1px solid #22c55e55' }}>
                                    <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#22c55e' }}>{savingSync ? <Spinner size={14} color="#ffffff" /> : <Car size={16} color="#ffffff" />}</span>
                                    <span className="flex-1 min-w-0 text-left">
                                        <span className="flex items-center gap-1.5 text-[13px] font-black">Sincronização para motorista{effectiveLiveSync && <Radio size={11} style={{ color: '#22c55e' }} />}</span>
                                        <span className="block text-[11px]" style={{ color: colors.textSecondary }}>Modo motorista ativo — toque para desativar</span>
                                    </span>
                                </button>
                            )}

                            {(newAddress || resolvingAddress) && (
                                <div className="rounded-2xl px-3 py-2.5 mb-3 flex items-start gap-2.5" style={{ background: `${ORANGE}12`, border: `1.5px solid ${ORANGE}66` }}>
                                    <MapPin size={16} className="mt-0.5 flex-shrink-0" style={{ color: ORANGE }} />
                                    <div className="min-w-0">
                                        <p className="text-[10.5px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>{effectiveLiveSync ? 'Localização atual (ao vivo)' : 'Endereço escolhido'}</p>
                                        <p className="text-[13px] font-bold leading-snug mt-0.5">{resolvingAddress ? 'Achando o endereço...' : newAddress}</p>
                                    </div>
                                </div>
                            )}

                            {error && <p className="text-[12px] font-bold mb-2" style={{ color: '#ef4444' }}>{error}</p>}

                            <button
                                onClick={() => {
                                    setError('')
                                    // o número já veio no endereço escolhido ("Avenida Calama 1234, ..."): preenche sozinho
                                    if (!newNumber.trim()) { const m = (newAddress.split(',')[0] || '').match(/\s(\d{1,6}[A-Za-z]?)\s*$/); if (m) setNewNumber(m[1]) }
                                    setStep('details')
                                }}
                                disabled={!newAddress || resolvingAddress}
                                className="w-full h-12 rounded-full text-[14px] font-black disabled:opacity-40 active:scale-[0.98] transition flex items-center justify-center gap-1.5"
                                style={pill(true)}
                            >
                                {resolvingAddress ? 'Achando o endereço...' : !newAddress ? 'Escolha um endereço' : <>Continuar<ChevronRight size={16} /></>}
                            </button>
                        </>
                    )}

                    {/* ===== 2 DE 2 · DETALHES (número, complemento e, se for o caso, o Radar) — salva direto ===== */}
                    {step === 'details' && (
                        <>
                            {head(2, 'Falta pouco')}
                            <button onClick={() => setStep('address')} className="w-full rounded-2xl px-3 py-2.5 mb-3 flex items-start gap-2.5 text-left" style={field}>
                                <MapPin size={16} className="mt-0.5 flex-shrink-0" style={{ color: ORANGE }} />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[13px] font-bold leading-snug">{newAddress}</span>
                                    <span className="block text-[11.5px] font-black mt-0.5" style={{ color: ORANGE }}>Trocar endereço</span>
                                </span>
                            </button>

                            <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
                                <label className="block">
                                    <span className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>Número *</span>
                                    <input
                                        type="text" inputMode="numeric" value={newNumber}
                                        onChange={(e) => { setNewNumber(e.target.value); setNumberError('') }}
                                        onKeyDown={(e) => { if (e.key === 'Enter') saveNow() }}
                                        placeholder="Ex.: 2836" autoFocus
                                        className="mt-1 w-full h-12 rounded-2xl px-3.5 text-[15px] font-bold outline-none"
                                        style={{ ...field, borderColor: numberError ? '#ef4444' : colors.border }}
                                    />
                                </label>
                                <button onClick={() => { setNewNumber('S/N'); setNumberError('') }} className="mt-[22px] h-12 px-3.5 rounded-2xl text-[12.5px] font-black" style={newNumber === 'S/N' ? pill(true) : pill(false)}>Sem número</button>
                            </div>
                            {numberError && <p className="text-[11.5px] font-bold mt-1" style={{ color: '#ef4444' }}>{numberError}</p>}

                            <label className="block mt-3">
                                <span className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>Complemento (opcional)</span>
                                <input
                                    type="text" value={newComplement}
                                    onChange={(e) => setNewComplement(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') saveNow() }}
                                    placeholder="Apto, bloco, portão azul..."
                                    className="mt-1 w-full h-12 rounded-2xl px-3.5 text-[14px] outline-none"
                                    style={field}
                                />
                            </label>

                            {askVisibility && (
                                <div className="mt-4">
                                    <p className="text-[11px] font-black uppercase tracking-wide mb-1.5" style={{ color: colors.textSecondary }}>No Radar</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {([
                                            { value: true, icon: <Radio size={16} />, title: 'Aparecer', text: 'perto de quem procura' },
                                            { value: false, icon: <Home size={16} />, title: 'Só salvar', text: 'ninguém vê você no mapa' },
                                        ] as const).map((o) => {
                                            const on = radarChoice === o.value
                                            return (
                                                <button key={String(o.value)} onClick={() => { setRadarChoice(o.value); setError('') }} className="rounded-2xl p-3 text-left active:scale-[0.98] transition" style={{ border: `1.5px solid ${on ? ORANGE : colors.border}`, background: on ? `${ORANGE}14` : colors.surface }}>
                                                    <span className="flex items-center gap-1.5 text-[13.5px] font-black" style={{ color: on ? ORANGE : colors.textPrimary }}>{o.icon}{o.title}{on && <Check size={14} className="ml-auto" />}</span>
                                                    <span className="block text-[11px] mt-0.5 leading-snug" style={{ color: colors.textSecondary }}>{o.text}</span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                    <p className="text-[10.5px] mt-1.5" style={{ color: colors.textSecondary }}>Dá para mudar depois em Painel do perfil → Visível no Radar.</p>
                                </div>
                            )}

                            {error && <p className="text-[12px] font-bold mt-2" style={{ color: '#ef4444' }}>{error}</p>}

                            <div className="flex gap-2 mt-4">
                                <button onClick={() => setStep('address')} disabled={loading || savingChoice} className="h-12 px-5 rounded-full text-[13px] font-black disabled:opacity-50" style={pill(false)}>Voltar</button>
                                <button onClick={saveNow} disabled={loading || savingChoice || !newAddress} className="flex-1 h-12 rounded-full text-[14px] font-black disabled:opacity-40 flex items-center justify-center gap-1.5 active:scale-[0.98] transition" style={pill(true)}>
                                    {savingChoice ? <Spinner size={16} color="#ffffff" /> : <Check size={16} />}
                                    {isStore ? 'Salvar local da loja' : 'Salvar localização'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ===== CONFIRMATION DIALOG ===== */}
            {showConfirmDialog && pendingLocation && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
                    <div
                        className="w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 animate-slide-up"
                        style={{
                            background: colors.surface,
                            border: `1px solid ${colors.border}`,
                            color: colors.textPrimary,
                        }}
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ background: '#f9731620' }}>
                                <AlertCircle size={20} style={{ color: '#f97316' }} />
                            </div>
                            <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                Confirmar localização
                            </h2>
                        </div>

                        <div className="space-y-2 p-3 rounded-xl" style={{ background: `${colors.surface}88` }}>
                            <p className="text-xs font-medium" style={{ color: colors.textPrimary }}>
                                Você está prestes a salvar esta localização:
                            </p>
                            <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                📍 {pendingLocation.address}
                            </p>
                            <div className="flex gap-3 text-xs" style={{ color: colors.textPrimary }}>
                                <span>Nº: <strong style={{ color: colors.textPrimary }}>{pendingLocation.addressNumber}</strong></span>
                                {pendingLocation.addressComplement && (
                                    <span>Complemento: <strong style={{ color: colors.textPrimary }}>{pendingLocation.addressComplement}</strong></span>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={cancelConfirmation}
                                className="flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all hover:scale-[1.02]"
                                style={{
                                    background: `${colors.surface}88`,
                                    color: colors.textPrimary,
                                    border: `1px solid ${colors.border}`,
                                }}
                            >
                                Voltar
                            </button>
                            <button
                                onClick={confirmSave}
                                className="flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all hover:scale-[1.02] flex items-center justify-center gap-2"
                                style={{
                                    background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                    color: '#ffffff',
                                    boxShadow: '0 4px 14px rgba(249, 115, 22, 0.4)',
                                    border: 'none',
                                }}
                            >
                                <Check size={14} />
                                Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showDeactivateConfirm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
                    <div
                        className="w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 animate-slide-up"
                        style={{
                            background: colors.surface,
                            border: `1px solid ${colors.border}`,
                            color: colors.textPrimary,
                        }}
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ background: '#f9731620' }}>
                                <Car size={20} style={{ color: '#f97316' }} />
                            </div>
                            <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                Desativar modo motorista?
                            </h2>
                        </div>

                        <p className="text-xs font-medium" style={{ color: colors.textPrimary, opacity: 0.8 }}>
                            Você não vai mais aparecer como disponível para novas corridas até ativar o modo de novo em /painel-motorista.
                        </p>

                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => setShowDeactivateConfirm(false)}
                                disabled={savingSync}
                                className="flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all hover:scale-[1.02] disabled:opacity-60"
                                style={{
                                    background: `${colors.surface}88`,
                                    color: colors.textPrimary,
                                    border: `1px solid ${colors.border}`,
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDeactivateDriverMode}
                                disabled={savingSync}
                                className="flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all hover:scale-[1.02] flex items-center justify-center gap-2 disabled:opacity-60"
                                style={{
                                    background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                    color: '#ffffff',
                                    boxShadow: '0 4px 14px rgba(249, 115, 22, 0.4)',
                                    border: 'none',
                                }}
                            >
                                {savingSync ? <Spinner size={14} color="#ffffff" /> : <Check size={14} />}
                                Desativar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style jsx global>{`
                @keyframes fade-in {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slide-up {
                    from { opacity: 0; transform: translateY(30px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .animate-fade-in {
                    animation: fade-in 0.2s ease-out forwards;
                }
                .animate-slide-up {
                    animation: slide-up 0.3s ease-out forwards;
                }
            `}</style>
        </>,
        document.body,
    )
}