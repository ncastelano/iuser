// src/app/(main)/LocationPicker.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTheme } from '@/app/contexts/theme'
import { MapPin, X, Check, Navigation, Search, Home, MoveVertical, Hash, FileText, AlertCircle, Car, Radio } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { getCurrentPosition as getNativeCurrentPosition, watchPosition as watchNativePosition, GeoWatchHandle } from '@/lib/nativeGeolocation'

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

export default function LocationPicker({ initialLocation, onSave, onClose, allowDriverSync = true }: LocationPickerProps) {
    const { colors } = useTheme()
    const router = useRouter()

    const { userId, isLoggedIn: isAuthenticated, loading: profileLoading } = useProfile()
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

    // ===== ETAPAS (mesmo padrão do CatalogBag: uma pergunta por vez) =====
    // 'choose' pergunta como a pessoa quer definir o local (escrever ou
    // marcar no mapa); 'address' mostra a busca/mapa; 'number' e
    // 'complement' vêm depois, em sequência, só depois do endereço definido.
    const [step, setStep] = useState<'choose' | 'address' | 'number' | 'complement'>('choose')
    const [method, setMethod] = useState<'search' | 'map' | null>(null)

    const chooseMethod = useCallback((m: 'search' | 'map') => {
        setMethod(m)
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
                .update({ driver_mode_active: false })
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

    const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            performSearch(searchQuery)
        }
    }, [performSearch, searchQuery])

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

    useEffect(() => {
        if (step !== 'address' || !authChecked || !isAuthenticated || !mapContainerRef.current) {
            return
        }

        const timer = setTimeout(() => {
            if (!initializedRef.current) {
                initializeMap()
            }
        }, 200)

        return () => clearTimeout(timer)
    }, [step, authChecked, isAuthenticated, initializeMap])

    // O container do mapa só existe no DOM enquanto a etapa é 'address' (ver
    // JSX mais abaixo) - ao sair dessa etapa, o container antigo é desmontado
    // e o Leaflet fica órfão. Zera o guard de inicialização aqui pra que,
    // voltando pra 'address', um mapa novo seja montado no container novo -
    // sem isso, o mapa fica em branco na segunda vez.
    useEffect(() => {
        if (step === 'address' || !initializedRef.current) return
        initializedRef.current = false
        mapInstanceRef.current = null
        movableMarkerRef.current = null
        savedMarkerRef.current = null
        polylineRef.current = null
        setMapReady(false)
    }, [step])

    const handleGetCurrentLocation = useCallback(() => {
        setUsingGPS(true)
        setLoading(true)
        setError('')

        getNativeCurrentPosition(
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
    const confirmSave = useCallback(() => {
        if (pendingLocation) {
            onSave(pendingLocation)
            setShowConfirmDialog(false)
            setPendingLocation(null)
        }
    }, [pendingLocation, onSave])

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

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm">
                <div
                    className="rounded-2xl p-3 sm:p-4 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
                    style={{
                        background: colors.surface,
                        backdropFilter: 'blur(20px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                        border: `1px solid ${colors.border}`,
                        color: colors.textPrimary,
                    }}
                >
                    <h3 className="text-base sm:text-lg font-extrabold mb-3 tracking-tight flex items-center gap-2">
                        <MapPin size={20} style={{ color: '#f97316' }} />
                        Definir localização
                    </h3>

                    {/* ===== ETAPA 1 DE 4 · COMO DEFINIR ===== */}
                    {step === 'choose' && (
                        <>
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#f97316' }}>
                                    Etapa 1 de 4 · Localização
                                </p>
                                <button onClick={onClose} className="p-1 rounded-full hover:bg-black/5 transition" style={{ color: colors.textSecondary }}>
                                    <X size={16} />
                                </button>
                            </div>

                            {savedAddress && (
                                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl mb-3"
                                    style={{ background: `${colors.surface}88`, border: '1px solid #3B82F644' }}
                                >
                                    <div className="flex-shrink-0 mt-0.5">
                                        <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                                            <Home size={14} style={{ color: '#3B82F6' }} />
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider opacity-50" style={{ color: colors.textPrimary }}>
                                            Localização salva
                                        </span>
                                        <p className="text-xs font-medium mt-0.5 break-words leading-relaxed" style={{ color: colors.textPrimary }}>
                                            {savedAddress}
                                        </p>
                                        {savedNumber && (
                                            <p className="text-[11px] mt-0.5 opacity-70" style={{ color: colors.textPrimary }}>Nº {savedNumber}</p>
                                        )}
                                        {savedComplement && (
                                            <p className="text-[11px] mt-0.5 opacity-70 italic" style={{ color: colors.textPrimary }}>"{savedComplement}"</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            <p className="text-sm font-black mb-3" style={{ color: colors.textPrimary }}>
                                {savedAddress ? 'Quer atualizar sua localização?' : 'Você ainda não tem uma localização definida. Como quer defini-la?'}
                            </p>

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => chooseMethod('search')}
                                    className="flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 text-center transition hover:scale-[1.02] active:scale-95"
                                    style={{ borderColor: colors.border, background: 'transparent' }}
                                >
                                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${colors.surface}88`, color: colors.textSecondary }}>
                                        <Search size={18} />
                                    </div>
                                    <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>Escrever endereço</span>
                                    <span className="text-[9px]" style={{ color: colors.textSecondary, opacity: 0.8 }}>Digite o endereço</span>
                                </button>
                                <button
                                    onClick={() => chooseMethod('map')}
                                    className="flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 text-center transition hover:scale-[1.02] active:scale-95"
                                    style={{ borderColor: colors.border, background: 'transparent' }}
                                >
                                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${colors.surface}88`, color: colors.textSecondary }}>
                                        <MapPin size={18} />
                                    </div>
                                    <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>Marcar no mapa</span>
                                    <span className="text-[9px]" style={{ color: colors.textSecondary, opacity: 0.8 }}>Toque ou arraste o pino</span>
                                </button>
                            </div>
                        </>
                    )}

                    {/* ===== ETAPA 2 DE 4 · ENDEREÇO ===== */}
                    {step === 'address' && (
                        <>
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#f97316' }}>
                                    Etapa 2 de 4 · Endereço
                                </p>
                                <button onClick={onClose} className="p-1 rounded-full hover:bg-black/5 transition" style={{ color: colors.textSecondary }}>
                                    <X size={16} />
                                </button>
                            </div>

                            {method === 'search' && (
                                <>
                                    <p className="text-[10px] mb-2 opacity-60" style={{ color: colors.textPrimary }}>
                                        Escreva a localização e aperte <strong>Enter</strong> ou clique em <strong>"Ir"</strong> para buscar
                                    </p>
                                    <div className="flex gap-2 mb-3">
                                        <div className="flex-1 flex items-center pl-0 pr-2 py-0.5 rounded-full text-xs font-semibold"
                                            style={{ background: `${colors.surface}88`, backdropFilter: 'blur(10px)', border: `1px solid ${colors.border}` }}
                                        >
                                            <div className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${colors.surface}88` }}>
                                                <Search size={14} color={colors.textPrimary} />
                                            </div>
                                            <input
                                                type="text"
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                onKeyDown={handleSearchKeyDown}
                                                placeholder="Digite o endereço..."
                                                className="flex-1 bg-transparent outline-none ml-1.5 text-xs"
                                                style={{ color: colors.textPrimary }}
                                                disabled={loading}
                                                autoFocus
                                            />
                                            <button
                                                onClick={() => performSearch(searchQuery)}
                                                disabled={loading || !searchQuery.trim()}
                                                className="px-3 py-1 rounded-full text-xs font-bold transition-all hover:scale-105 disabled:opacity-50"
                                                style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)', color: '#ffffff', boxShadow: '0 2px 8px rgba(249, 115, 22, 0.3)' }}
                                            >
                                                {loading ? '...' : 'Ir'}
                                            </button>
                                        </div>

                                        <button
                                            onClick={handleGetCurrentLocation}
                                            disabled={loading}
                                            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50 flex-shrink-0"
                                            style={{ background: '#f9731620', color: '#f97316', border: '1px solid #f9731640' }}
                                            title="Usar GPS"
                                        >
                                            {usingGPS ? <Spinner size={14} color="#f97316" /> : <Navigation size={14} />}
                                            <span className="hidden sm:inline">GPS</span>
                                        </button>
                                    </div>
                                    <p className="text-[10px] mb-2 opacity-60 text-center" style={{ color: colors.textPrimary }}>
                                        Ou arraste o <strong>Pin</strong> ou o <strong>mapa</strong> para ajustar a localização
                                    </p>
                                </>
                            )}

                            {method === 'map' && (
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-black" style={{ color: colors.textPrimary }}>
                                        Toque no mapa ou arraste o pino laranja
                                    </p>
                                    <button
                                        onClick={handleGetCurrentLocation}
                                        disabled={loading}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50 flex-shrink-0"
                                        style={{ background: '#f9731620', color: '#f97316', border: '1px solid #f9731640' }}
                                        title="Usar GPS"
                                    >
                                        {usingGPS ? <Spinner size={14} color="#f97316" /> : <Navigation size={14} />}
                                        GPS
                                    </button>
                                </div>
                            )}

                            <div className="relative w-full h-48 sm:h-56 rounded-xl overflow-hidden mb-3"
                                style={{ border: `2px solid ${colors.border}`, background: colors.surface }}
                            >
                                <div ref={mapContainerRef} className="w-full h-full" />
                                {!mapReady && (
                                    <div className="absolute inset-0 flex items-center justify-center" style={{ background: colors.surface }}>
                                        <Spinner size={24} color="#f97316" />
                                    </div>
                                )}
                            </div>

                            {allowDriverSync && isDriver && driverModeActive && (
                                <button
                                    onClick={() => setShowDeactivateConfirm(true)}
                                    disabled={savingSync}
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl mb-3 transition-all disabled:opacity-60"
                                    style={{ background: '#22c55e20', border: '1px solid #22c55e60' }}
                                >
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#22c55e' }}>
                                        {savingSync ? <Spinner size={14} color="#ffffff" /> : <Car size={16} color="#ffffff" />}
                                    </div>
                                    <div className="flex-1 min-w-0 text-left">
                                        <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: colors.textPrimary }}>
                                            Sincronização para motorista
                                            {effectiveLiveSync && <Radio size={11} style={{ color: '#22c55e' }} />}
                                        </span>
                                        <p className="text-[10px] mt-0.5 opacity-70" style={{ color: colors.textPrimary }}>
                                            Modo motorista ativo — toque para desativar
                                        </p>
                                    </div>
                                    <div className="flex-shrink-0 w-10 h-6 rounded-full relative transition-all" style={{ background: '#22c55e' }}>
                                        <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all" style={{ left: 18 }} />
                                    </div>
                                </button>
                            )}

                            <div className="space-y-2 mb-3">
                                {savedPosition && !effectiveLiveSync && (
                                    <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl"
                                        style={{ background: `${colors.surface}88`, border: '1px solid #3B82F644' }}
                                    >
                                        <div className="flex-shrink-0 mt-0.5">
                                            <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                                                <Home size={14} style={{ color: '#3B82F6' }} />
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-50" style={{ color: colors.textPrimary }}>
                                                Localização salva
                                            </span>
                                            <p className="text-xs font-medium mt-0.5 break-words leading-relaxed" style={{ color: colors.textPrimary }}>
                                                {savedAddress || 'Carregando endereço...'}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl"
                                    style={{ background: `${colors.surface}88`, border: '1px solid #F9731644' }}
                                >
                                    <div className="flex-shrink-0 mt-0.5">
                                        <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center">
                                            <MoveVertical size={14} style={{ color: '#f97316' }} />
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider opacity-50" style={{ color: colors.textPrimary }}>
                                            {effectiveLiveSync ? 'Localização atual (ao vivo)' : 'Endereço selecionado'}
                                        </span>
                                        {resolvingAddress ? (
                                            <p className="text-xs mt-0.5 opacity-50" style={{ color: colors.textPrimary }}>
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

                            {error && (
                                <p className="text-red-500 text-xs font-medium mb-2 ml-1">{error}</p>
                            )}

                            <div className="flex gap-2 mt-3">
                                <button
                                    onClick={() => setStep('choose')}
                                    className="flex-1 py-2.5 rounded-xl font-bold text-xs transition hover:scale-105 active:scale-95"
                                    style={{ background: 'transparent', border: `2px solid ${colors.border}`, color: colors.textSecondary }}
                                >
                                    Voltar
                                </button>
                                <button
                                    onClick={() => setStep('number')}
                                    disabled={!newAddress || resolvingAddress}
                                    className="flex-1 py-2.5 rounded-xl font-bold text-xs transition hover:scale-105 active:scale-95 disabled:opacity-50"
                                    style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)', color: '#ffffff', boxShadow: '0 4px 14px #f9731660' }}
                                >
                                    {resolvingAddress ? 'Obtendo endereço...' : !newAddress ? 'Selecione um local' : 'Continuar'}
                                </button>
                            </div>
                        </>
                    )}

                    {/* ===== ETAPA 3 DE 4 · NÚMERO ===== */}
                    {step === 'number' && (
                        <>
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#f97316' }}>
                                    Etapa 3 de 4 · Número
                                </p>
                                <button onClick={onClose} className="p-1 rounded-full hover:bg-black/5 transition" style={{ color: colors.textSecondary }}>
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl mb-3"
                                style={{ background: `${colors.surface}88`, border: '1px solid #F9731644' }}
                            >
                                <div className="flex-shrink-0 mt-0.5">
                                    <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center">
                                        <MoveVertical size={14} style={{ color: '#f97316' }} />
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider opacity-50" style={{ color: colors.textPrimary }}>
                                        Endereço
                                    </span>
                                    <p className="text-xs font-medium mt-0.5 break-words leading-relaxed" style={{ color: colors.textPrimary }}>
                                        {newAddress}
                                    </p>
                                </div>
                            </div>

                            <p className="text-sm font-black mb-3" style={{ color: colors.textPrimary }}>
                                Qual o número?
                            </p>

                            <div className="px-3 py-2 rounded-xl mb-3"
                                style={{ background: `${colors.surface}88`, border: `1px solid ${numberError ? '#EF4444' : colors.border}` }}
                            >
                                <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider opacity-50 mb-1" style={{ color: colors.textPrimary }}>
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
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleContinueToComplement() }}
                                    placeholder="Ex: 2836"
                                    className="w-full bg-transparent outline-none text-xs font-medium"
                                    style={{ color: colors.textPrimary }}
                                    autoFocus
                                    required
                                />
                                {numberError && (
                                    <p className="text-red-500 text-[10px] mt-1">{numberError}</p>
                                )}
                            </div>

                            <div className="flex gap-2 mt-3">
                                <button
                                    onClick={() => setStep('address')}
                                    className="flex-1 py-2.5 rounded-xl font-bold text-xs transition hover:scale-105 active:scale-95"
                                    style={{ background: 'transparent', border: `2px solid ${colors.border}`, color: colors.textSecondary }}
                                >
                                    Voltar
                                </button>
                                <button
                                    onClick={handleContinueToComplement}
                                    className="flex-1 py-2.5 rounded-xl font-bold text-xs transition hover:scale-105 active:scale-95"
                                    style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)', color: '#ffffff', boxShadow: '0 4px 14px #f9731660' }}
                                >
                                    Continuar
                                </button>
                            </div>
                        </>
                    )}

                    {/* ===== ETAPA 4 DE 4 · COMPLEMENTO ===== */}
                    {step === 'complement' && (
                        <>
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#f97316' }}>
                                    Etapa 4 de 4 · Complemento
                                </p>
                                <button onClick={onClose} className="p-1 rounded-full hover:bg-black/5 transition" style={{ color: colors.textSecondary }}>
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="space-y-2 mb-3">
                                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl"
                                    style={{ background: `${colors.surface}88`, border: '1px solid #F9731644' }}
                                >
                                    <div className="flex-shrink-0 mt-0.5">
                                        <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center">
                                            <MoveVertical size={14} style={{ color: '#f97316' }} />
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider opacity-50" style={{ color: colors.textPrimary }}>
                                            Endereço
                                        </span>
                                        <p className="text-xs font-medium mt-0.5 break-words leading-relaxed" style={{ color: colors.textPrimary }}>
                                            {newAddress}
                                        </p>
                                        <p className="text-[11px] mt-0.5 opacity-70" style={{ color: colors.textPrimary }}>Nº {newNumber}</p>
                                    </div>
                                </div>
                            </div>

                            <p className="text-sm font-black mb-3" style={{ color: colors.textPrimary }}>
                                Quer adicionar algum complemento?
                            </p>

                            <div className="px-3 py-2 rounded-xl mb-3"
                                style={{ background: `${colors.surface}88`, border: `1px solid ${colors.border}` }}
                            >
                                <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider opacity-50 mb-1" style={{ color: colors.textPrimary }}>
                                    <FileText size={12} />
                                    Complemento (opcional)
                                </label>
                                <input
                                    type="text"
                                    value={newComplement}
                                    onChange={(e) => setNewComplement(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveWithConfirmation() }}
                                    placeholder="Ex: Casa com parede de cerâmica, portão azul..."
                                    className="w-full bg-transparent outline-none text-xs font-medium"
                                    style={{ color: colors.textPrimary }}
                                    autoFocus
                                />
                            </div>

                            {error && (
                                <p className="text-red-500 text-xs font-medium mb-2 ml-1">{error}</p>
                            )}

                            <div className="flex gap-2 mt-3">
                                <button
                                    onClick={() => setStep('number')}
                                    disabled={loading}
                                    className="flex-1 py-2.5 rounded-xl font-bold text-xs transition hover:scale-105 active:scale-95 disabled:opacity-50"
                                    style={{ background: 'transparent', border: `2px solid ${colors.border}`, color: colors.textSecondary }}
                                >
                                    Voltar
                                </button>
                                <button
                                    onClick={handleSaveWithConfirmation}
                                    disabled={loading || !newAddress}
                                    className="flex-1 py-2.5 rounded-xl font-bold text-xs transition hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                    style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)', color: '#ffffff', boxShadow: '0 4px 14px #f9731660' }}
                                >
                                    <Check size={14} />
                                    Salvar localização
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
        </>
    )
}