// app/(main)/[profileSlug]/EditarPerfil.tsx

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import {
    Save,
    CheckCircle,
    AlertCircle,
    ArrowLeft,
    Camera,
    MapPinned,
    Eye,
    EyeOff,
    Search,
    Navigation,
    MoveVertical,
    Hash,
    FileText,
    Loader2,
    X,
} from 'lucide-react'
import { useTheme } from '@/app/theme'
import { toast } from 'sonner'

interface EditarPerfilProps {
    profile: any
    onUpdate: (updated: any) => void
    onClose: () => void
}

// Cache para geocodificação
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

function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}

export default function EditarPerfil({ profile, onUpdate, onClose }: EditarPerfilProps) {
    const { colors } = useTheme()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const mapContainerRef = useRef<HTMLDivElement>(null)
    const mapInstanceRef = useRef<any>(null)
    const movableMarkerRef = useRef<any>(null)
    const isMovingRef = useRef(false)
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
    const initializedRef = useRef(false)

    // Form states
    const [name, setName] = useState(profile.name || '')
    const [profileSlug, setProfileSlug] = useState(profile.profileSlug || '')
    const [address, setAddress] = useState(profile.address || '')
    const [showLocation, setShowLocation] = useState(profile.show_location ?? true)
    const [avatarFile, setAvatarFile] = useState<File | null>(null)
    const [previewAvatar, setPreviewAvatar] = useState<string | null>(null)

    // Loading states
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [showSuccessDialog, setShowSuccessDialog] = useState(false)

    // Location states
    const [selectedPosition, setSelectedPosition] = useState<{ lat: number; lng: number }>(() => {
        if (profile.location) {
            try {
                if (typeof profile.location === 'string') {
                    const match = profile.location.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i)
                    if (match) {
                        return { lat: parseFloat(match[2]), lng: parseFloat(match[1]) }
                    }
                }
                return { lat: -15.7801, lng: -47.9292 }
            } catch {
                return { lat: -15.7801, lng: -47.9292 }
            }
        }
        return { lat: -15.7801, lng: -47.9292 }
    })
    const [manualAddress, setManualAddress] = useState(profile.address || '')
    const [searchQuery, setSearchQuery] = useState('')
    const [resolvingAddress, setResolvingAddress] = useState(false)
    const [locationError, setLocationError] = useState('')
    const [mapReady, setMapReady] = useState(false)
    const [usingGPS, setUsingGPS] = useState(false)
    const [editingLocation, setEditingLocation] = useState(false)
    const [addressNumber, setAddressNumber] = useState('')
    const [addressComplement, setAddressComplement] = useState('')
    const [suggestions, setSuggestions] = useState<any[]>([])

    // Slug
    const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
    const [slugSuggestions, setSlugSuggestions] = useState<string[]>([])

    // Avatar preview local
    useEffect(() => {
        if (!avatarFile) return
        const url = URL.createObjectURL(avatarFile)
        setPreviewAvatar(url)
        return () => URL.revokeObjectURL(url)
    }, [avatarFile])

    // Verificar slug
    useEffect(() => {
        if (!profileSlug || !profile) return
        if (profileSlug === profile.profileSlug) {
            setSlugStatus('idle')
            setSlugSuggestions([])
            return
        }
        const check = async () => {
            setSlugStatus('checking')
            const { data } = await supabase
                .from('profiles')
                .select('id')
                .eq('profileSlug', profileSlug)
                .neq('id', profile.id)
                .maybeSingle()
            if (data) {
                setSlugStatus('taken')
                const base = profileSlug.replace(/-?\d+$/, '')
                setSlugSuggestions([1, 2, 3].map(n => `${base}-${n}`))
            } else {
                setSlugStatus('available')
                setSlugSuggestions([])
            }
        }
        const timer = setTimeout(check, 600)
        return () => clearTimeout(timer)
    }, [profileSlug, profile])

    // Autocomplete endereço (para busca)
    useEffect(() => {
        const delay = setTimeout(() => {
            if (manualAddress.length < 4) return
            fetchSuggestions(manualAddress)
        }, 500)
        return () => clearTimeout(delay)
    }, [manualAddress])

    const fetchSuggestions = async (query: string) => {
        try {
            const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
            const res = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&autocomplete=true&country=BR&limit=5`
            )
            const data = await res.json()
            setSuggestions(data.features || [])
        } catch (e) {
            console.error(e)
        }
    }

    const selectSuggestion = (feature: any) => {
        const [lng, lat] = feature.center
        setSelectedPosition({ lat, lng })
        setManualAddress(feature.place_name)
        setAddress(feature.place_name)
        setSuggestions([])
        if (editingLocation) {
            flyTo(lat, lng)
        }
    }

    // Inicializar mapa
    useEffect(() => {
        if (typeof window === 'undefined' || !mapContainerRef.current || initializedRef.current || !editingLocation) return

        initializedRef.current = true

        const initMap = async () => {
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

                setResolvingAddress(true)
                setLocationError('')
                reverseGeocode(newPos.lat, newPos.lng).then(result => {
                    setAddress(result.fullAddress)
                    setManualAddress(result.fullAddress)
                    if (result.extractedNumber && !addressNumber) {
                        setAddressNumber(result.extractedNumber)
                    }
                    setResolvingAddress(false)
                })
            })

            mapInstanceRef.current = map
            movableMarkerRef.current = movableMarker

            map.on('moveend', () => {
                if (isMovingRef.current) {
                    isMovingRef.current = false
                    return
                }

                const center = map.getCenter()
                const newPos = { lat: center.lat, lng: center.lng }
                movableMarker.setLatLng([newPos.lat, newPos.lng])
                setSelectedPosition(newPos)

                if (debounceTimerRef.current) {
                    clearTimeout(debounceTimerRef.current)
                }

                setResolvingAddress(true)
                setLocationError('')

                debounceTimerRef.current = setTimeout(async () => {
                    try {
                        const result = await reverseGeocode(newPos.lat, newPos.lng)
                        setAddress(result.fullAddress)
                        setManualAddress(result.fullAddress)
                        if (result.extractedNumber && !addressNumber) {
                            setAddressNumber(result.extractedNumber)
                        }
                    } catch (err) {
                        const fallback = `Local (${newPos.lat.toFixed(4)}, ${newPos.lng.toFixed(4)})`
                        setAddress(fallback)
                        setManualAddress(fallback)
                    } finally {
                        setResolvingAddress(false)
                    }
                }, 500)
            })

            setResolvingAddress(true)
            try {
                const result = await reverseGeocode(selectedPosition.lat, selectedPosition.lng)
                setAddress(result.fullAddress)
                setManualAddress(result.fullAddress)
                if (result.extractedNumber) {
                    setAddressNumber(result.extractedNumber)
                }
            } catch (err) {
                const fallback = `Local (${selectedPosition.lat.toFixed(4)}, ${selectedPosition.lng.toFixed(4)})`
                setAddress(fallback)
                setManualAddress(fallback)
            } finally {
                setResolvingAddress(false)
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
        }
    }, [editingLocation])

    const flyTo = useCallback((lat: number, lng: number) => {
        if (!mapInstanceRef.current || !movableMarkerRef.current) return

        isMovingRef.current = true
        mapInstanceRef.current.flyTo([lat, lng], 16, { duration: 0.8 })
        movableMarkerRef.current.setLatLng([lat, lng])
    }, [])

    const handleGetCurrentLocation = () => {
        if (!navigator.geolocation) {
            setLocationError('Geolocalização não suportada')
            return
        }

        setUsingGPS(true)
        setLocationError('')

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
                    setAddress(result.fullAddress)
                    setManualAddress(result.fullAddress)
                    if (result.extractedNumber) {
                        setAddressNumber(result.extractedNumber)
                    }
                } catch (err) {
                    const fallback = `Local (${newPos.lat.toFixed(4)}, ${newPos.lng.toFixed(4)})`
                    setAddress(fallback)
                    setManualAddress(fallback)
                } finally {
                    setResolvingAddress(false)
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
                setLocationError(msg)
                setUsingGPS(false)
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        )
    }

    const handleSearchAddress = async () => {
        if (!searchQuery.trim()) return

        setLocationError('')

        const result = await geocodeAddress(searchQuery.trim())

        if (result) {
            setSelectedPosition({ lat: result.lat, lng: result.lng })
            setAddress(result.address)
            setManualAddress(result.address)
            flyTo(result.lat, result.lng)
            setSearchQuery('')
        } else {
            setLocationError('Endereço não encontrado.')
        }
    }

    const getAvatarUrl = (path: string | null) => {
        if (!path) return null
        if (path.startsWith('http')) return path
        return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
    }

    const handleSave = async () => {
        if (!name || !profileSlug) {
            setError('Nome e @username são obrigatórios')
            return
        }
        if (slugStatus === 'taken' || slugStatus === 'checking') {
            setError('Escolha um @username disponível')
            return
        }

        setLoading(true)
        setError(null)

        try {
            let avatarUrl = profile.avatar_url

            if (avatarFile) {
                const fileExt = avatarFile.name.split('.').pop()
                const fileName = `${profile.id}-${Date.now()}.${fileExt}`
                const { error: uploadError } = await supabase.storage
                    .from('avatars')
                    .upload(fileName, avatarFile, { upsert: true })
                if (uploadError) throw uploadError
                const { data } = supabase.storage.from('avatars').getPublicUrl(fileName)
                avatarUrl = data.publicUrl
            }

            const updateData: any = {
                name,
                profileSlug,
                avatar_url: avatarUrl,
                address,
                show_location: showLocation,
            }

            if (selectedPosition) {
                updateData.location = `POINT(${selectedPosition.lng} ${selectedPosition.lat})`
            }

            const { error: updateError } = await supabase
                .from('profiles')
                .update(updateData)
                .eq('id', profile.id)

            if (updateError) throw updateError

            onUpdate({
                ...profile,
                name: name.trim(),
                profileSlug,
                avatar_url: avatarUrl,
                address,
                show_location: showLocation,
                location: selectedPosition ? `POINT(${selectedPosition.lng} ${selectedPosition.lat})` : null,
            })

            setShowSuccessDialog(true)

        } catch (err: any) {
            console.error('Erro ao salvar:', err)
            setError(err.message || 'Erro ao salvar alterações')
            toast.error('Erro ao salvar: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleCloseSuccessAndExit = () => {
        setShowSuccessDialog(false)
        onClose()
    }

    const handleCancel = () => {
        onClose()
    }

    const surfaceRgb = hexToRgb(colors.surface)

    return (
        <>
            <div className="max-w-2xl mx-auto">
                <div
                    className="rounded-3xl p-8 space-y-8"
                    style={{
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        border: `1px solid ${colors.border}`,
                        boxShadow: colors.shadow,
                    }}
                >
                    {/* Cabeçalho */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleCancel}
                                className="p-2 rounded-xl hover:bg-white/10 transition"
                                style={{ color: colors.textSecondary }}
                            >
                                <ArrowLeft size={20} />
                            </button>
                            <h2 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                                Editar Perfil
                            </h2>
                        </div>
                    </div>

                    {/* Mensagem de erro */}
                    {error && (
                        <div className="p-4 rounded-xl flex items-center gap-3"
                            style={{ background: '#ef444410', border: '1px solid #ef444430' }}>
                            <AlertCircle size={20} style={{ color: '#ef4444' }} />
                            <p className="text-sm font-bold" style={{ color: '#ef4444' }}>{error}</p>
                        </div>
                    )}

                    <div className="space-y-6">
                        {/* Avatar */}
                        <div className="flex flex-col items-center gap-4">
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="relative w-32 h-32 rounded-full overflow-hidden cursor-pointer group border-2"
                                style={{ borderColor: colors.border }}
                            >
                                {previewAvatar || profile?.avatar_url ? (
                                    <img
                                        src={previewAvatar || getAvatarUrl(profile.avatar_url) || undefined}
                                        className="w-full h-full object-cover"
                                        alt="Avatar"
                                    />
                                ) : (
                                    <div
                                        className="w-full h-full flex items-center justify-center text-4xl font-black"
                                        style={{ background: colors.background, color: colors.textSecondary }}
                                    >
                                        {name?.charAt(0) || '?'}
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Camera className="w-8 h-8 text-white" />
                                </div>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file) setAvatarFile(file)
                                }}
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="text-xs font-bold underline"
                                style={{ color: colors.accent }}
                            >
                                Alterar foto
                            </button>
                        </div>

                        {/* Nome */}
                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                                Nome
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border text-sm font-bold focus:outline-none transition"
                                style={{
                                    background: colors.surface,
                                    borderColor: colors.border,
                                    color: colors.textPrimary,
                                }}
                                placeholder="Seu nome completo"
                            />
                        </div>

                        {/* Slug */}
                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                                @username
                            </label>
                            <div
                                className="flex items-center rounded-xl overflow-hidden border"
                                style={{ borderColor: colors.border }}
                            >
                                <span
                                    className="px-3 py-3 text-xs font-bold"
                                    style={{ background: colors.background, color: colors.textSecondary }}
                                >
                                    @
                                </span>
                                <input
                                    type="text"
                                    value={profileSlug}
                                    onChange={(e) =>
                                        setProfileSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                                    }
                                    className="flex-1 px-3 py-3 text-sm font-mono font-bold bg-transparent outline-none"
                                    style={{ color: colors.textPrimary }}
                                    placeholder="seu-nome"
                                />
                            </div>
                            {slugStatus === 'checking' && (
                                <p className="text-xs" style={{ color: colors.textSecondary }}>Verificando...</p>
                            )}
                            {slugStatus === 'available' && (
                                <p className="text-xs" style={{ color: '#22c55e' }}>Disponível ✓</p>
                            )}
                            {slugStatus === 'taken' && (
                                <p className="text-xs" style={{ color: '#ef4444' }}>Indisponível ✗</p>
                            )}
                            {slugSuggestions.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {slugSuggestions.map(sug => (
                                        <button
                                            key={sug}
                                            onClick={() => {
                                                setProfileSlug(sug)
                                                setSlugSuggestions([])
                                            }}
                                            className="px-3 py-1 rounded-full text-xs font-bold border"
                                            style={{
                                                background: `${colors.accent}11`,
                                                borderColor: colors.accent,
                                                color: colors.accent,
                                            }}
                                        >
                                            {sug}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Localização */}
                        <div className="space-y-3">
                            <label
                                className="text-xs font-black uppercase tracking-wider flex items-center gap-2"
                                style={{ color: colors.textSecondary }}
                            >
                                <MapPinned size={14} /> Localização
                            </label>

                            {!editingLocation ? (
                                <div className="space-y-2">
                                    <div className="p-4 bg-orange-50/50 rounded-xl border border-orange-200 space-y-2">
                                        <p className="text-sm font-medium text-gray-800">
                                            {address || "Nenhuma localização definida"}
                                        </p>
                                        <button
                                            onClick={() => {
                                                setEditingLocation(true)
                                                setMapReady(false)
                                                initializedRef.current = false
                                            }}
                                            className="flex items-center gap-2 text-orange-600 hover:text-orange-700 text-[9px] uppercase font-black tracking-wider"
                                        >
                                            <Camera size={12} />
                                            {address ? 'Editar Localização' : 'Adicionar Localização'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {/* Busca + GPS */}
                                    <div className="flex gap-2">
                                        <div className="flex-1 flex items-center pl-0 pr-2 py-0.5 rounded-full text-xs font-semibold"
                                            style={{
                                                background: `rgba(255,255,255,0.4)`,
                                                backdropFilter: 'blur(10px)',
                                                border: `1px solid #fbd5a4`,
                                            }}
                                        >
                                            <div className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0"
                                                style={{ background: `rgba(255,255,255,0.4)` }}>
                                                <Search size={14} color="#f97316" />
                                            </div>
                                            <input
                                                type="text"
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                placeholder="Buscar endereço..."
                                                className="flex-1 bg-transparent outline-none ml-1.5 text-xs text-gray-700"
                                                onKeyDown={(e) => { if (e.key === 'Enter') handleSearchAddress() }}
                                            />
                                            {searchQuery && (
                                                <button
                                                    onClick={handleSearchAddress}
                                                    className="px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-orange-500 to-red-500 text-white"
                                                >
                                                    Ir
                                                </button>
                                            )}
                                        </div>

                                        <button
                                            onClick={handleGetCurrentLocation}
                                            disabled={usingGPS}
                                            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50 flex-shrink-0"
                                            style={{
                                                background: `#f9731622`,
                                                color: '#f97316',
                                                border: `1px solid #f9731644`,
                                            }}
                                            title="Usar GPS"
                                        >
                                            {usingGPS ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />}
                                            <span className="hidden sm:inline">GPS</span>
                                        </button>
                                    </div>

                                    {/* Mapa */}
                                    <div className="relative w-full h-48 sm:h-56 rounded-xl overflow-hidden"
                                        style={{
                                            border: `2px solid #fbd5a4`,
                                            background: '#fff',
                                        }}
                                    >
                                        <div ref={mapContainerRef} className="w-full h-full" />

                                        {!mapReady && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                                                <Loader2 size={24} className="animate-spin" style={{ color: '#f97316' }} />
                                            </div>
                                        )}
                                    </div>

                                    {/* Endereço encontrado */}
                                    <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl"
                                        style={{
                                            background: `rgba(255,255,255,0.4)`,
                                            border: `1px solid #fbd5a4`,
                                        }}
                                    >
                                        <div className="flex-shrink-0 mt-0.5">
                                            <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center">
                                                <MoveVertical size={14} style={{ color: '#f97316' }} />
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-50 text-gray-600">
                                                Localização selecionada
                                            </span>
                                            {resolvingAddress ? (
                                                <p className="text-xs mt-0.5 opacity-50 text-gray-500">
                                                    Obtendo endereço...
                                                </p>
                                            ) : (
                                                <p className="text-xs font-medium mt-0.5 break-words leading-relaxed text-gray-700">
                                                    {address || 'Arraste o marcador ou mova o mapa'}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {locationError && (
                                        <p className="text-red-500 text-xs font-medium">{locationError}</p>
                                    )}

                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => {
                                                setEditingLocation(false)
                                            }}
                                            className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-black uppercase text-[9px] tracking-wider hover:bg-gray-300 transition-all"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={() => setEditingLocation(false)}
                                            className="flex-1 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-black uppercase text-[9px] tracking-wider hover:shadow-lg transition-all"
                                        >
                                            Salvar Localização
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Toggle visibilidade */}
                        <div
                            className="flex items-center justify-between p-4 rounded-xl border"
                            style={{ borderColor: colors.border }}
                        >
                            <div>
                                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                    Mostrar localização no perfil
                                </p>
                                <p className="text-xs" style={{ color: colors.textSecondary }}>
                                    Outros usuários poderão ver seu endereço
                                </p>
                            </div>
                            <button
                                onClick={() => setShowLocation(!showLocation)}
                                className="p-2 rounded-lg"
                                style={{ background: colors.background }}
                            >
                                {showLocation ? (
                                    <Eye size={20} style={{ color: '#f97316' }} />
                                ) : (
                                    <EyeOff size={20} style={{ color: colors.textSecondary }} />
                                )}
                            </button>
                        </div>

                        {/* Preview do perfil */}
                        <div className="rounded-2xl p-4 flex items-center gap-4"
                            style={{ background: `${colors.accent}10`, border: `1px solid ${colors.border}` }}>
                            <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0"
                                style={{ background: colors.accentLight }}>
                                {profile.avatar_url ? (
                                    <img
                                        src={getAvatarUrl(profile.avatar_url) || undefined}
                                        className="w-full h-full object-cover"
                                        alt=""
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-2xl font-black"
                                        style={{ color: colors.accent }}>
                                        {name.charAt(0) || profile.name?.charAt(0) || '?'}
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold" style={{ color: colors.textSecondary }}>
                                    Visualização do perfil:
                                </p>
                                <p className="text-xl font-black truncate" style={{ color: colors.textPrimary }}>
                                    {name || 'Seu nome aparecerá aqui'}
                                </p>
                                <p className="text-xs font-bold mt-1" style={{ color: '#f97316' }}>
                                    @{profileSlug || profile.profileSlug}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Botões */}
                    <div className="flex gap-3 pt-4">
                        <button
                            onClick={handleCancel}
                            className="flex-1 py-4 rounded-xl font-bold text-sm uppercase tracking-wider hover:bg-white/5 transition"
                            style={{
                                background: 'transparent',
                                border: `1px solid ${colors.border}`,
                                color: colors.textSecondary,
                            }}
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={loading || !name.trim()}
                            className="flex-1 py-4 rounded-xl font-black text-sm uppercase tracking-wider shadow-lg hover:scale-105 transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
                            style={{
                                background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                color: '#ffffff',
                            }}
                        >
                            {loading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Salvando...
                                </>
                            ) : (
                                <>
                                    <Save size={18} />
                                    Salvar Alterações
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Diálogo de Sucesso */}
            {showSuccessDialog && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                    <div
                        className="w-full max-w-md rounded-3xl p-8 shadow-2xl space-y-6"
                        style={{
                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.95)`,
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            border: `1px solid ${colors.border}`,
                            boxShadow: colors.shadow,
                        }}
                    >
                        {/* Ícone de sucesso */}
                        <div className="flex justify-center">
                            <div className="w-20 h-20 rounded-full flex items-center justify-center"
                                style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)' }}>
                                <CheckCircle size={48} style={{ color: '#ffffff' }} />
                            </div>
                        </div>

                        {/* Mensagem */}
                        <div className="text-center space-y-2">
                            <h3 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                                Perfil Atualizado!
                            </h3>
                            <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                                Suas alterações foram salvas com sucesso.
                            </p>
                        </div>

                        {/* Preview rápido */}
                        <div className="rounded-2xl p-4 flex items-center gap-4"
                            style={{ background: `${colors.accent}10` }}>
                            <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0"
                                style={{ background: colors.accentLight }}>
                                {profile.avatar_url ? (
                                    <img
                                        src={getAvatarUrl(profile.avatar_url) || undefined}
                                        className="w-full h-full object-cover"
                                        alt=""
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-xl font-black"
                                        style={{ color: colors.accent }}>
                                        {name.charAt(0) || '?'}
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-lg font-black truncate" style={{ color: colors.textPrimary }}>
                                    {name}
                                </p>
                                <p className="text-xs font-bold" style={{ color: '#f97316' }}>
                                    @{profileSlug || profile.profileSlug}
                                </p>
                            </div>
                        </div>

                        {/* Botão */}
                        <button
                            onClick={handleCloseSuccessAndExit}
                            className="w-full py-4 rounded-xl font-black uppercase text-sm tracking-widest shadow-lg hover:scale-105 transition-transform"
                            style={{
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                color: '#fff',
                            }}
                        >
                            <ArrowLeft size={18} className="inline mr-2" />
                            Voltar para o Perfil
                        </button>
                    </div>
                </div>
            )}
        </>
    )
}