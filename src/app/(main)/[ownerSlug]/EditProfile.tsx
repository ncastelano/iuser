// src/components/owner/EditProfile.tsx
'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
    X,
    Pencil,
    User,
    MessageCircle,
    MapPin,
    Navigation,
    Save,
    Camera,
    Trash2,
    Check,
    AlertCircle,
    Search,
    MoveVertical,
    Hash,
    FileText,
    Home,
    Plus,
} from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { formatBrazilianPhone, cleanPhoneNumber, geocodeAddress, reverseGeocode } from './Profile'

interface OwnerData {
    id: string
    name: string
    slug: string
    type: 'profile'
    avatar_url?: string | null
    business_hours?: any
    description?: string | null
    address?: string | null
    whatsapp?: string | null
    view_count?: number
    ratings_avg?: number
    ratings_count?: number
    show_location?: boolean
    location?: any
}

interface EditProfileProps {
    owner: OwnerData
    imageUrl: string | null
    colors: any
    onClose: () => void
    onUpdate: (updatedOwner: OwnerData) => void
}

export function EditProfile({ owner, imageUrl, colors, onClose, onUpdate }: EditProfileProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const mapContainerRef = useRef<HTMLDivElement>(null)
    const mapInstanceRef = useRef<any>(null)
    const movableMarkerRef = useRef<any>(null)
    const polylineRef = useRef<any>(null)
    const isMovingRef = useRef(false)
    const initializedRef = useRef(false)

    // Form states
    const [editName, setEditName] = useState(owner.name || '')
    const [editWhatsapp, setEditWhatsapp] = useState(owner.whatsapp ? formatBrazilianPhone(owner.whatsapp) : '')
    const [editDescription, setEditDescription] = useState(owner.description || '')
    const [editAddress, setEditAddress] = useState(owner.address || '')
    const [editLocation, setEditLocation] = useState<{ lat: number; lng: number } | null>(null)
    const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null)
    const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(imageUrl || null)
    const [editing, setEditing] = useState(false)

    // Location picker states
    const [showLocationPicker, setShowLocationPicker] = useState(false)
    const [locationPickerLoading, setLocationPickerLoading] = useState(false)
    const [locationPickerResolving, setLocationPickerResolving] = useState(false)
    const [locationPickerError, setLocationPickerError] = useState('')
    const [numberError, setNumberError] = useState('')
    const [mapReady, setMapReady] = useState(false)

    // Confirmation dialog
    const [showConfirmDialog, setShowConfirmDialog] = useState(false)
    const [pendingLocation, setPendingLocation] = useState<{
        lat: number;
        lng: number;
        address: string;
        addressNumber: string;
        addressComplement: string;
    } | null>(null)

    // Picker state
    const [pickerPosition, setPickerPosition] = useState<{ lat: number; lng: number }>({
        lat: -15.7801,
        lng: -47.9292
    })
    const [pickerSavedPosition, setPickerSavedPosition] = useState<{ lat: number; lng: number } | null>(null)
    const [pickerAddress, setPickerAddress] = useState('')
    const [pickerNumber, setPickerNumber] = useState('')
    const [pickerComplement, setPickerComplement] = useState('')
    const [pickerSearchQuery, setPickerSearchQuery] = useState('')
    const [pickerUsingGPS, setPickerUsingGPS] = useState(false)

    const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
    const glassBg = 'rgba(255, 255, 255, 0.08)'
    const glassBgLight = 'rgba(255, 255, 255, 0.05)'

    // Initialize location from owner
    useEffect(() => {
        if (owner.location && owner.location.coordinates && Array.isArray(owner.location.coordinates)) {
            setEditLocation({
                lat: owner.location.coordinates[1],
                lng: owner.location.coordinates[0]
            })
        }
    }, [owner])

    // ========== AVATAR HANDLERS ==========
    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setEditAvatarFile(file)
        const reader = new FileReader()
        reader.onloadend = () => {
            setEditAvatarPreview(reader.result as string)
        }
        reader.readAsDataURL(file)
    }

    // ========== WHATSAPP HANDLER ==========
    const handleWhatsappChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const formatted = formatBrazilianPhone(e.target.value)
        setEditWhatsapp(formatted)
    }

    // ========== LOCATION PICKER FUNCTIONS ==========
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

    const initializePickerMap = useCallback(async () => {
        if (initializedRef.current || !mapContainerRef.current || !showLocationPicker) {
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
                center: [pickerPosition.lat, pickerPosition.lng],
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

            const movableMarker = L.marker([pickerPosition.lat, pickerPosition.lng], {
                icon: orangeIcon,
                draggable: true,
                zIndexOffset: 1000
            }).addTo(map)

            movableMarker.on('dragend', () => {
                const pos = movableMarker.getLatLng()
                const newPos = { lat: pos.lat, lng: pos.lng }
                setPickerPosition(newPos)
                updatePolyline(map, pickerSavedPosition, newPos)

                setLocationPickerResolving(true)
                setLocationPickerError('')
                reverseGeocode(newPos.lat, newPos.lng).then(result => {
                    setPickerAddress(result.fullAddress)
                    if (result.extractedNumber && !pickerNumber) {
                        setPickerNumber(result.extractedNumber)
                    }
                    setLocationPickerResolving(false)
                })
            })

            mapInstanceRef.current = map
            movableMarkerRef.current = movableMarker

            if (pickerSavedPosition) {
                updatePolyline(map, pickerSavedPosition, pickerPosition)
            }

            setLocationPickerResolving(true)
            try {
                const result = await reverseGeocode(pickerPosition.lat, pickerPosition.lng)
                setPickerAddress(result.fullAddress)
                if (result.extractedNumber) {
                    setPickerNumber(result.extractedNumber)
                }
            } catch (err) {
                const fallback = `Local (${pickerPosition.lat.toFixed(4)}, ${pickerPosition.lng.toFixed(4)})`
                setPickerAddress(fallback)
            } finally {
                setLocationPickerResolving(false)
            }

            setMapReady(true)
        } catch (error) {
            console.error('Erro ao inicializar mapa:', error)
            initializedRef.current = false
        }
    }, [pickerPosition, pickerSavedPosition, pickerNumber, showLocationPicker, updatePolyline])

    useEffect(() => {
        if (showLocationPicker && mapContainerRef.current) {
            const timer = setTimeout(() => {
                if (!initializedRef.current) {
                    initializePickerMap()
                }
            }, 300)
            return () => clearTimeout(timer)
        }
    }, [showLocationPicker, initializePickerMap])

    const flyTo = useCallback((lat: number, lng: number) => {
        if (!mapInstanceRef.current || !movableMarkerRef.current) return

        isMovingRef.current = true
        mapInstanceRef.current.flyTo([lat, lng], 16, { duration: 0.8 })
        movableMarkerRef.current.setLatLng([lat, lng])
        updatePolyline(mapInstanceRef.current, pickerSavedPosition, { lat, lng })
    }, [pickerSavedPosition, updatePolyline])

    const handleGetCurrentLocation = useCallback(() => {
        if (!navigator.geolocation) {
            setLocationPickerError('Geolocalização não suportada')
            return
        }

        setPickerUsingGPS(true)
        setLocationPickerLoading(true)
        setLocationPickerError('')

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const newPos = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude
                }
                setPickerPosition(newPos)
                flyTo(newPos.lat, newPos.lng)

                setLocationPickerResolving(true)
                try {
                    const result = await reverseGeocode(newPos.lat, newPos.lng)
                    setPickerAddress(result.fullAddress)
                    if (result.extractedNumber) {
                        setPickerNumber(result.extractedNumber)
                    }
                } catch (err) {
                    const fallback = `Local (${newPos.lat.toFixed(4)}, ${newPos.lng.toFixed(4)})`
                    setPickerAddress(fallback)
                } finally {
                    setLocationPickerResolving(false)
                    setLocationPickerLoading(false)
                    setPickerUsingGPS(false)
                }
            },
            (err) => {
                let msg = 'Erro ao obter localização. '
                switch (err.code) {
                    case err.PERMISSION_DENIED: msg += 'Permissão negada.'; break
                    case err.POSITION_UNAVAILABLE: msg += 'Localização indisponível.'; break
                    case err.TIMEOUT: msg += 'Tempo esgotado.'; break
                }
                setLocationPickerError(msg)
                setLocationPickerLoading(false)
                setPickerUsingGPS(false)
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        )
    }, [flyTo])

    const handleSearchAddress = useCallback(async () => {
        if (!pickerSearchQuery.trim()) return

        setLocationPickerLoading(true)
        setLocationPickerError('')

        const result = await geocodeAddress(pickerSearchQuery.trim())

        if (result) {
            setPickerPosition({ lat: result.lat, lng: result.lng })
            setPickerAddress(result.address)
            flyTo(result.lat, result.lng)
            setPickerSearchQuery('')
        } else {
            setLocationPickerError('Endereço não encontrado.')
        }

        setLocationPickerLoading(false)
    }, [pickerSearchQuery, flyTo])

    const handleSaveWithConfirmation = useCallback(() => {
        if (!pickerNumber.trim()) {
            setNumberError('O número é obrigatório')
            return
        }
        setNumberError('')

        let fullAddressWithDetails = pickerAddress

        if (pickerNumber && !pickerAddress.includes(pickerNumber)) {
            const firstCommaIndex = fullAddressWithDetails.indexOf(',')
            if (firstCommaIndex !== -1) {
                fullAddressWithDetails = fullAddressWithDetails.slice(0, firstCommaIndex) +
                    `, ${pickerNumber}` +
                    fullAddressWithDetails.slice(firstCommaIndex)
            }
        }

        setPendingLocation({
            lat: pickerPosition.lat,
            lng: pickerPosition.lng,
            address: fullAddressWithDetails,
            addressNumber: pickerNumber,
            addressComplement: pickerComplement
        })
        setShowConfirmDialog(true)
    }, [pickerNumber, pickerAddress, pickerComplement, pickerPosition])

    const confirmSave = useCallback(() => {
        if (pendingLocation) {
            setEditAddress(pendingLocation.address)
            setEditLocation({ lat: pendingLocation.lat, lng: pendingLocation.lng })
            setShowConfirmDialog(false)
            setShowLocationPicker(false)
            initializedRef.current = false
            setMapReady(false)
            toast.success('Localização atualizada!')
            setPendingLocation(null)
        }
    }, [pendingLocation])

    const cancelConfirmation = useCallback(() => {
        setShowConfirmDialog(false)
        setPendingLocation(null)
    }, [])

    const openLocationPicker = () => {
        if (editAddress) {
            setPickerAddress(editAddress)
        }
        if (editLocation) {
            setPickerPosition(editLocation)
            setPickerSavedPosition(editLocation)
        } else {
            setPickerPosition({ lat: -15.7801, lng: -47.9292 })
            setPickerSavedPosition(null)
        }
        setPickerNumber('')
        setPickerComplement('')
        setPickerSearchQuery('')
        setLocationPickerError('')
        setNumberError('')
        setMapReady(false)
        initializedRef.current = false
        setShowLocationPicker(true)
    }

    const removeLocation = () => {
        setEditAddress('')
        setEditLocation(null)
        toast.success('Localização removida!')
    }

    // ========== SAVE PROFILE ==========
    const saveProfileChanges = async () => {
        if (!owner) return
        setEditing(true)

        try {
            let avatarUrl: string | null = owner.avatar_url || null

            if (editAvatarFile) {
                const fileExt = editAvatarFile.name.split('.').pop()
                const fileName = `${owner.id}-${Date.now()}.${fileExt}`
                const { error: uploadError } = await supabase.storage
                    .from('avatars')
                    .upload(fileName, editAvatarFile, { upsert: true })
                if (uploadError) throw uploadError
                const { data } = supabase.storage.from('avatars').getPublicUrl(fileName)
                avatarUrl = data.publicUrl
            }

            const cleanedWhatsapp = cleanPhoneNumber(editWhatsapp)

            const updates: any = {
                name: editName,
                description: editDescription,
                whatsapp: cleanedWhatsapp || null,
                address: editAddress || null,
            }
            if (editLocation) {
                updates.location = `POINT(${editLocation.lng} ${editLocation.lat})`
                updates.show_location = true
            } else {
                updates.location = null
                updates.show_location = false
            }
            if (avatarUrl !== owner.avatar_url) {
                updates.avatar_url = avatarUrl
            }

            const { error: updateError } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', owner.id)

            if (updateError) throw updateError

            const updatedOwner = {
                ...owner,
                name: editName,
                description: editDescription,
                whatsapp: cleanedWhatsapp || null,
                address: editAddress || null,
                avatar_url: avatarUrl,
                location: editLocation ? { coordinates: [editLocation.lng, editLocation.lat] } : null,
                show_location: !!editLocation,
            }

            onUpdate(updatedOwner)

            toast.success('Perfil atualizado com sucesso!')
            onClose()
        } catch (err: any) {
            toast.error('Erro ao atualizar perfil: ' + err.message)
        } finally {
            setEditing(false)
        }
    }

    return (
        <>
            <div
                className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in"
                style={{
                    background: 'rgba(0, 0, 0, 0.8)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                }}
                onClick={onClose}
            >
                <div
                    className="w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 animate-slide-up max-h-[90vh] overflow-y-auto"
                    style={{
                        background: colors.surface,
                        border: `1px solid ${colors.border}`,
                        color: colors.textPrimary,
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex justify-between items-center sticky top-0 z-10 pb-2" style={{ background: colors.surface }}>
                        <div className="flex items-center gap-2">
                            <Pencil size={18} style={{ color: '#f97316' }} />
                            <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                Editar Perfil
                            </h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/10 transition"
                            style={{ background: glassBgLight }}
                        >
                            <X size={18} style={{ color: colors.textSecondary }} />
                        </button>
                    </div>

                    {/* Avatar */}
                    <div className="flex flex-col items-center">
                        <div className="relative">
                            <div
                                className="w-24 h-24 rounded-full p-[2px]"
                                style={{ background: GRADIENT }}
                            >
                                <div className="w-full h-full rounded-full overflow-hidden bg-white flex items-center justify-center">
                                    {editAvatarPreview ? (
                                        <img src={editAvatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-4xl font-black" style={{ color: '#f97316' }}>
                                            {editName?.charAt(0) || '?'}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleAvatarChange}
                                accept="image/*"
                                style={{ display: 'none' }}
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="absolute -bottom-1 -right-1 p-1.5 rounded-full transition-all hover:scale-110"
                                style={{ background: GRADIENT, color: '#fff' }}
                            >
                                <Camera size={14} />
                            </button>
                        </div>
                        <span className="text-[10px] mt-1.5" style={{ color: colors.textSecondary }}>
                            Clique na câmera para trocar a foto
                        </span>
                    </div>

                    {/* Form */}
                    <div className="space-y-3">
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 mb-1" style={{ color: colors.textSecondary }}>
                                <User size={12} />
                                Nome
                            </label>
                            <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-full rounded-xl py-2.5 px-3 text-sm font-bold focus:outline-none transition"
                                style={{
                                    background: glassBgLight,
                                    border: `1px solid ${colors.border}`,
                                    color: colors.textPrimary,
                                }}
                                placeholder="Seu nome"
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 mb-1" style={{ color: colors.textSecondary }}>
                                <MessageCircle size={12} />
                                WhatsApp
                            </label>
                            <input
                                type="text"
                                value={editWhatsapp}
                                onChange={handleWhatsappChange}
                                className="w-full rounded-xl py-2.5 px-3 text-sm font-bold focus:outline-none transition"
                                style={{
                                    background: glassBgLight,
                                    border: `1px solid ${colors.border}`,
                                    color: colors.textPrimary,
                                }}
                                placeholder="(00) 00000-0000"
                                maxLength={16}
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 mb-1" style={{ color: colors.textSecondary }}>
                                <Navigation size={12} />
                                Localização
                            </label>

                            {editAddress ? (
                                <div className="space-y-2">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={editAddress}
                                            readOnly
                                            className="flex-1 rounded-xl py-2.5 px-3 text-sm font-bold focus:outline-none transition cursor-pointer"
                                            style={{
                                                background: glassBgLight,
                                                border: `1px solid ${colors.border}`,
                                                color: colors.textPrimary,
                                                opacity: 0.7,
                                            }}
                                            placeholder="Clique no botão para definir"
                                        />
                                        <button
                                            onClick={openLocationPicker}
                                            className="px-4 py-2.5 rounded-xl text-xs font-bold transition-all hover:scale-105 flex items-center gap-1.5 flex-shrink-0"
                                            style={{
                                                background: GRADIENT,
                                                color: '#ffffff',
                                                boxShadow: '0 2px 10px rgba(249, 115, 22, 0.3)',
                                                border: 'none',
                                            }}
                                        >
                                            <MapPin size={14} />
                                            Buscar
                                        </button>
                                    </div>
                                    <button
                                        onClick={removeLocation}
                                        className="w-full py-2 rounded-xl text-xs font-bold transition-all hover:scale-105 flex items-center justify-center gap-1.5"
                                        style={{
                                            background: '#ef444420',
                                            color: '#ef4444',
                                            border: '1px solid #ef444440',
                                        }}
                                    >
                                        <Trash2 size={14} />
                                        Remover localização
                                    </button>
                                    <p className="text-[10px] opacity-70" style={{ color: colors.textSecondary }}>
                                        📍 {editAddress}
                                    </p>
                                </div>
                            ) : (
                                <button
                                    onClick={openLocationPicker}
                                    className="w-full py-2.5 rounded-xl text-xs font-bold transition-all hover:scale-105 flex items-center justify-center gap-1.5"
                                    style={{
                                        background: GRADIENT,
                                        color: '#ffffff',
                                        boxShadow: '0 2px 10px rgba(249, 115, 22, 0.3)',
                                        border: 'none',
                                    }}
                                >
                                    <MapPin size={14} />
                                    Definir localização
                                </button>
                            )}
                        </div>

                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 mb-1" style={{ color: colors.textSecondary }}>
                                <Plus size={12} />
                                Descrição
                            </label>
                            <textarea
                                value={editDescription}
                                onChange={(e) => setEditDescription(e.target.value)}
                                className="w-full rounded-xl py-2.5 px-3 text-sm font-bold focus:outline-none transition resize-none"
                                style={{
                                    background: glassBgLight,
                                    border: `1px solid ${colors.border}`,
                                    color: colors.textPrimary,
                                    minHeight: '80px',
                                }}
                                placeholder="Fale sobre você ou seu negócio..."
                                rows={3}
                            />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2 sticky bottom-0 pb-1" style={{ background: colors.surface }}>
                        <button
                            onClick={onClose}
                            className="flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all hover:scale-[1.02]"
                            style={{
                                background: glassBg,
                                color: colors.textSecondary,
                                border: `1px solid ${colors.border}`,
                            }}
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={saveProfileChanges}
                            disabled={editing}
                            className="flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all hover:scale-[1.02] flex items-center justify-center gap-2 disabled:opacity-50"
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
                                boxShadow: '0 4px 14px rgba(249, 115, 22, 0.4)',
                                border: 'none',
                            }}
                        >
                            {editing ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></div>
                            ) : (
                                <>
                                    <Save size={14} />
                                    Salvar
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* ===== LOCATION PICKER ===== */}
            {showLocationPicker && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm">
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

                        <p className="text-[10px] mb-2 opacity-60" style={{ color: colors.textSecondary }}>
                            Escreva a localização e clique em <strong>"Ir"</strong> para buscar
                        </p>

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
                                    value={pickerSearchQuery}
                                    onChange={(e) => setPickerSearchQuery(e.target.value)}
                                    placeholder="Digite o endereço..."
                                    className="flex-1 bg-transparent outline-none ml-1.5 text-xs"
                                    style={{ color: colors.textPrimary }}
                                    disabled={locationPickerLoading}
                                />
                                <button
                                    onClick={() => handleSearchAddress()}
                                    disabled={locationPickerLoading || !pickerSearchQuery.trim()}
                                    className="px-3 py-1 rounded-full text-xs font-bold transition-all hover:scale-105 disabled:opacity-50"
                                    style={{
                                        background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                        color: '#ffffff',
                                        boxShadow: '0 2px 8px rgba(249, 115, 22, 0.3)',
                                    }}
                                >
                                    {locationPickerLoading ? '...' : 'Ir'}
                                </button>
                            </div>

                            <button
                                onClick={handleGetCurrentLocation}
                                disabled={locationPickerLoading}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50 flex-shrink-0"
                                style={{
                                    background: '#f9731620',
                                    color: '#f97316',
                                    border: '1px solid #f9731640',
                                }}
                                title="Usar GPS"
                            >
                                {pickerUsingGPS ? <Spinner size={14} /> : <Navigation size={14} />}
                                <span className="hidden sm:inline">GPS</span>
                            </button>
                        </div>

                        <p className="text-[10px] mb-2 opacity-60 text-center" style={{ color: colors.textSecondary }}>
                            Ou arraste o <strong>Pin</strong> ou o <strong>mapa</strong> para ajustar a localização
                        </p>

                        <div className="relative w-full h-48 sm:h-56 rounded-xl overflow-hidden mb-3"
                            style={{
                                border: `2px solid ${colors.border}`,
                                background: colors.surface,
                            }}
                        >
                            <div ref={mapContainerRef} className="w-full h-full" />
                            {!mapReady && (
                                <div className="absolute inset-0 flex items-center justify-center" style={{ background: colors.surface }}>
                                    <Spinner size={24} color='#f97316' />
                                </div>
                            )}
                        </div>

                        <div className="space-y-2 mb-3">
                            {pickerSavedPosition && (
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
                                            {pickerAddress || 'Carregando endereço...'}
                                        </p>
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
                                        <MoveVertical size={14} style={{ color: '#f97316' }} />
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider opacity-50" style={{ color: colors.textSecondary }}>
                                        Nova localização
                                    </span>
                                    {locationPickerResolving ? (
                                        <p className="text-xs mt-0.5 opacity-50" style={{ color: colors.textSecondary }}>
                                            Obtendo endereço...
                                        </p>
                                    ) : (
                                        <p className="text-xs font-medium mt-0.5 break-words leading-relaxed" style={{ color: colors.textPrimary }}>
                                            {pickerAddress || 'Arraste o marcador laranja ou mova o mapa'}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {!locationPickerResolving && pickerAddress && (
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
                                        value={pickerNumber}
                                        onChange={(e) => {
                                            setPickerNumber(e.target.value)
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
                                        value={pickerComplement}
                                        onChange={(e) => setPickerComplement(e.target.value)}
                                        placeholder="Ex: Casa com parede de cerâmica, portão azul..."
                                        className="w-full bg-transparent outline-none text-xs font-medium"
                                        style={{ color: colors.textPrimary }}
                                    />
                                </div>
                            </div>
                        )}

                        {locationPickerError && (
                            <p className="text-red-500 text-xs font-medium mb-2 ml-1">{locationPickerError}</p>
                        )}

                        <p className="text-[10px] mb-3 ml-1 opacity-50" style={{ color: colors.textSecondary }}>
                            💡 Arraste o marcador laranja ou o mapa para ajustar a nova localização
                        </p>

                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => {
                                    setShowLocationPicker(false)
                                    initializedRef.current = false
                                    setMapReady(false)
                                }}
                                disabled={locationPickerLoading}
                                className="flex items-center pl-0 pr-3 py-0.5 rounded-full text-xs font-semibold transition-all hover:opacity-80"
                                style={{ background: `${colors.surface}88`, backdropFilter: 'blur(10px)', color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                            >
                                <div className="h-7 w-7 rounded-full flex items-center justify-center" style={{ background: `${colors.surface}88` }}>
                                    <X size={14} />
                                </div>
                                <span className="ml-1.5">Cancelar</span>
                            </button>

                            <button
                                onClick={handleSaveWithConfirmation}
                                disabled={locationPickerLoading || !pickerAddress}
                                className="flex items-center pl-0 pr-3 py-0.5 rounded-full text-xs font-semibold transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
                                style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)', color: '#ffffff', boxShadow: '0 2px 10px rgba(249, 115, 22, 0.3)' }}
                            >
                                <div className="h-7 w-7 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)' }}>
                                    <Check size={14} />
                                </div>
                                <span className="ml-1.5">Salvar localização</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== CONFIRMATION DIALOG ===== */}
            {showConfirmDialog && pendingLocation && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
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
                            <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                                Você está prestes a salvar esta localização:
                            </p>
                            <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                📍 {pendingLocation.address}
                            </p>
                            <div className="flex gap-3 text-xs" style={{ color: colors.textSecondary }}>
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
                                    color: colors.textSecondary,
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

            <style jsx global>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(30px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .animate-slide-up {
                    animation: slideUp 0.3s ease-out forwards;
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .animate-fade-in {
                    animation: fadeIn 0.2s ease-out forwards;
                }
            `}</style>
        </>
    )
}