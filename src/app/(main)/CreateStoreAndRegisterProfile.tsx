// app/(main)/CreateStoreAndRegisterProfile.tsx
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import {
    Camera,
    MapPinned,
    Edit3,
    X,
    ArrowLeft,
    Store,
    Sparkles,
    Zap,
    CheckCircle2,
    AlertCircle,
    User,
    Link as LinkIcon,
    Mail,
    Lock,
    Eye,
    EyeOff,
    ArrowRight,
    ChevronRight,
    Tag,
    Search,
    Navigation,
    MoveVertical,
    Hash,
    FileText,
} from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { toast } from 'sonner'
import AnimatedBackground from '@/components/AnimatedBackground'
import { createSquareImage } from '@/lib/image'
import { checkSlugAvailability, getSlugSuggestions, sanitizeSlug } from '@/lib/slugUtils'
import { categorias } from '@/lib/categorias'

// Filtra as categorias para remover "Social"
const CATEGORIAS_LOJAS = categorias.filter(cat => cat.slug !== 'social')

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
    fullAddress: string
    streetDisplay: string
    extractedNumber: string
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

type Step = 'store' | 'account' | 'success'

interface CreateStoreAndRegisterProfileProps {
    embedded?: boolean
    onBack?: () => void
}

export default function CreateStoreAndRegisterProfile({
    embedded = false,
    onBack,
}: CreateStoreAndRegisterProfileProps) {
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement | null>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)
    const mapContainerRef = useRef<HTMLDivElement>(null)
    const mapInstanceRef = useRef<any>(null)
    const movableMarkerRef = useRef<any>(null)
    const isMovingRef = useRef(false)
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
    const initializedRef = useRef(false)

    // Step control
    const [step, setStep] = useState<Step>('store')

    // Store data
    const [storeName, setStoreName] = useState('')
    const [storeSlug, setStoreSlug] = useState('')
    const [description, setDescription] = useState('')
    const [selectedCategorySlug, setSelectedCategorySlug] = useState('')
    const [selectedPosition, setSelectedPosition] = useState<{ lat: number; lng: number }>({
        lat: -15.7801,
        lng: -47.9292
    })
    const [address, setAddress] = useState('')
    const [addressNumber, setAddressNumber] = useState('')
    const [addressComplement, setAddressComplement] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [resolvingAddress, setResolvingAddress] = useState(false)
    const [locationError, setLocationError] = useState('')
    const [mapReady, setMapReady] = useState(false)
    const [usingGPS, setUsingGPS] = useState(false)
    const [showLocationConfirm, setShowLocationConfirm] = useState(false)
    const [pendingAddress, setPendingAddress] = useState('')
    const [pendingNumber, setPendingNumber] = useState('')
    const [loadingLocation, setLoadingLocation] = useState(false)
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<string | null>(null)

    // Slug check for store
    const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
    const [storeSlugSuggestions, setStoreSlugSuggestions] = useState<string[]>([])

    // Account data
    const [name, setName] = useState('')
    const [profileSlug, setProfileSlug] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [accountError, setAccountError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [profileSlugSuggestions, setProfileSlugSuggestions] = useState<string[]>([])
    const [accountAvatarFile, setAccountAvatarFile] = useState<File | null>(null)
    const [accountAvatarPreview, setAccountAvatarPreview] = useState<string | null>(null)
    const accountAvatarInputRef = useRef<HTMLInputElement | null>(null)

    const handleAccountAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setAccountAvatarFile(file)
        const reader = new FileReader()
        reader.onloadend = () => setAccountAvatarPreview(reader.result as string)
        reader.readAsDataURL(file)
    }

    // Slug auto-generation for store
    useEffect(() => {
        if (!storeName) {
            setStoreSlug('')
            return
        }
        setStoreSlug(sanitizeSlug(storeName))
    }, [storeName])

    // Check store slug availability with suggestions
    useEffect(() => {
        if (!storeSlug || step !== 'store') {
            setSlugStatus('idle')
            setStoreSlugSuggestions([])
            return
        }
        const check = async () => {
            setSlugStatus('checking')
            const result = await checkSlugAvailability(storeSlug)
            if (!result.available) {
                setSlugStatus('taken')
                const sugs = await getSlugSuggestions(storeSlug, 3)
                setStoreSlugSuggestions(sugs)
            } else {
                setSlugStatus('available')
                setStoreSlugSuggestions([])
            }
        }
        const timer = setTimeout(check, 600)
        return () => clearTimeout(timer)
    }, [storeSlug, step])

    // Check profile slug availability with suggestions
    useEffect(() => {
        if (!profileSlug || step !== 'account') {
            setProfileSlugSuggestions([])
            return
        }
        const check = async () => {
            const result = await checkSlugAvailability(profileSlug)
            if (!result.available) {
                const sugs = await getSlugSuggestions(profileSlug, 3)
                setProfileSlugSuggestions(sugs)
            } else {
                setProfileSlugSuggestions([])
            }
        }
        const timer = setTimeout(check, 600)
        return () => clearTimeout(timer)
    }, [profileSlug, step])

    // Image preview
    useEffect(() => {
        if (!imageFile) return
        const url = URL.createObjectURL(imageFile)
        setPreview(url)
        return () => URL.revokeObjectURL(url)
    }, [imageFile])

    // Mapa interativo (Leaflet)
    useEffect(() => {
        if (typeof window === 'undefined' || !mapContainerRef.current || initializedRef.current) return

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
                    if (result.extractedNumber) {
                        setAddressNumber(prev => prev || result.extractedNumber)
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
                        if (result.extractedNumber) {
                            setAddressNumber(prev => prev || result.extractedNumber)
                        }
                    } catch {
                        setAddress(`Local (${newPos.lat.toFixed(4)}, ${newPos.lng.toFixed(4)})`)
                    } finally {
                        setResolvingAddress(false)
                    }
                }, 500)
            })

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
    }, [])

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
        setLoadingLocation(true)
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
                    setPendingAddress(result.fullAddress)
                    setPendingNumber(result.extractedNumber)
                    setShowLocationConfirm(true)
                } catch {
                    setPendingAddress(`Local (${newPos.lat.toFixed(4)}, ${newPos.lng.toFixed(4)})`)
                    setPendingNumber('')
                    setShowLocationConfirm(true)
                } finally {
                    setResolvingAddress(false)
                    setLoadingLocation(false)
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
                setLoadingLocation(false)
                setUsingGPS(false)
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        )
    }

    const handleSearchAddress = async () => {
        if (!searchQuery.trim()) return

        setLoadingLocation(true)
        setLocationError('')

        const result = await geocodeAddress(searchQuery.trim())

        if (result) {
            setSelectedPosition({ lat: result.lat, lng: result.lng })
            flyTo(result.lat, result.lng)
            setPendingAddress(result.address)
            setPendingNumber('')
            setShowLocationConfirm(true)
        } else {
            setLocationError('Endereço não encontrado.')
        }

        setLoadingLocation(false)
    }

    // Busca automaticamente assim que o usuário para de digitar
    useEffect(() => {
        if (!searchQuery.trim() || searchQuery.trim().length < 4) return
        const timer = setTimeout(() => {
            handleSearchAddress()
        }, 800)
        return () => clearTimeout(timer)
    }, [searchQuery])

    const handleConfirmLocation = () => {
        setAddress(pendingAddress)
        if (pendingNumber) {
            setAddressNumber(prev => prev || pendingNumber)
        }
        setShowLocationConfirm(false)
        setPendingAddress('')
        setPendingNumber('')
        setSearchQuery('')
    }

    const handleRejectLocation = () => {
        setShowLocationConfirm(false)
        setPendingAddress('')
        setPendingNumber('')
        setSearchQuery('')
        toast.info('Digite o endereço correto no campo de busca')
        setTimeout(() => searchInputRef.current?.focus(), 150)
    }

    const handleImageChange = async (file: File) => {
        try {
            const squareFile = await createSquareImage(file, 400)
            setImageFile(squareFile)
        } catch (err) {
            toast.error('Erro ao processar imagem')
        }
    }

    const handleGoToAccount = () => {
        if (!storeName || !storeSlug) {
            toast.error('Preencha ao menos o nome e o link da loja')
            return
        }
        if (slugStatus === 'checking' || slugStatus === 'taken') {
            toast.error('Escolha um link disponível para a loja')
            return
        }
        if (!selectedCategorySlug) {
            toast.error('Selecione uma categoria')
            return
        }
        if (!addressNumber.trim()) {
            toast.error('Digite o número da localização')
            return
        }
        setStep('account')
    }

    const handleCreateAccountAndStore = async (e: React.FormEvent) => {
        e.preventDefault()
        setAccountError(null)
        setLoading(true)

        if (password !== confirmPassword) {
            setAccountError('As senhas não coincidem')
            setLoading(false)
            return
        }

        if (!accountAvatarFile) {
            setAccountError('Adicione uma foto de perfil para continuar')
            setLoading(false)
            return
        }

        if (!profileSlug || !/^[a-z0-9-]+$/.test(profileSlug)) {
            setAccountError('Seu link de perfil deve conter apenas letras minúsculas, números e hifens (-)')
            setLoading(false)
            return
        }

        if (profileSlugSuggestions.length > 0) {
            setAccountError('Escolha um link de perfil disponível')
            setLoading(false)
            return
        }

        if (profileSlug === storeSlug) {
            setAccountError('O link do seu perfil não pode ser igual ao link da sua loja')
            setLoading(false)
            return
        }

        try {
            // 1. Verificar disponibilidade global do profileSlug
            const profileCheck = await checkSlugAvailability(profileSlug)
            if (!profileCheck.available) {
                setAccountError(profileCheck.message || 'Este link de perfil já está em uso')
                setLoading(false)
                return
            }

            // 1.1 Verificar disponibilidade global do storeSlug
            const storeCheck = await checkSlugAvailability(storeSlug)
            if (!storeCheck.available) {
                setAccountError(storeCheck.message || 'Este link de loja já está em uso')
                setLoading(false)
                return
            }

            // 2. Criar usuário (auth)
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        name: name,
                    }
                }
            })
            if (authError) throw authError
            if (!authData.user) throw new Error('Erro ao criar usuário')

            const userId = authData.user.id

            // 2.1 Upload da foto de perfil (obrigatória)
            let accountAvatarUrl: string | null = null
            if (accountAvatarFile) {
                const avatarExt = accountAvatarFile.name.split('.').pop()
                const avatarFileName = `${userId}-${Date.now()}.${avatarExt}`
                const { error: avatarUploadError } = await supabase.storage
                    .from('avatars')
                    .upload(avatarFileName, accountAvatarFile, { upsert: true })
                if (avatarUploadError) {
                    throw new Error(`Erro ao enviar foto de perfil: ${avatarUploadError.message}`)
                }
                accountAvatarUrl = supabase.storage.from('avatars').getPublicUrl(avatarFileName).data.publicUrl
            }

            // 3. Criar perfil
            const { error: profileError } = await supabase
                .from('profiles')
                .upsert({
                    id: userId,
                    name: name,
                    profileSlug: profileSlug,
                    avatar_url: accountAvatarUrl,
                })
            if (profileError) {
                console.error('Erro ao criar perfil:', profileError)
                throw new Error('Erro ao criar perfil')
            }

            // 4. Upload da logo (se houver)
            let logoPath: string | null = null
            if (imageFile) {
                const fileExt = imageFile.name.split('.').pop()
                const fileName = `${Date.now()}.${fileExt}`
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('store-logos')
                    .upload(fileName, imageFile)
                if (uploadError) {
                    console.error('Erro no upload:', uploadError)
                }
                if (uploadData) {
                    logoPath = uploadData.path
                }
            }


            // 5. Criar loja — status aberto/fechado é definido pelo business_hours (StoreOperatingDays)
            const categoriaSelecionada = CATEGORIAS_LOJAS.find(c => c.slug === selectedCategorySlug)
            const categoryName = categoriaSelecionada?.nome || selectedCategorySlug

            let fullAddress = address
            if (addressNumber && !address.includes(addressNumber)) {
                const firstCommaIndex = fullAddress.indexOf(',')
                if (firstCommaIndex !== -1) {
                    fullAddress = fullAddress.slice(0, firstCommaIndex) +
                        `, ${addressNumber}` +
                        fullAddress.slice(firstCommaIndex)
                }
            }

            const { error: storeError } = await supabase.from('stores').insert({
                name: storeName,
                storeSlug,
                description,
                logo_url: logoPath,
                owner_id: userId,
                location: selectedPosition ? `POINT(${selectedPosition.lng} ${selectedPosition.lat})` : null,
                address: fullAddress,
                store_lat: selectedPosition.lat,
                store_lng: selectedPosition.lng,
                address_number: addressNumber,
                address_complement: addressComplement || null,
                category: categoryName,
            })

            if (storeError) {
                toast.error('Loja criada, mas houve um erro: ' + storeError.message)
            }

            setStep('success')
        } catch (err: any) {
            setAccountError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleGoToStore = () => {
        window.location.href = `/${profileSlug}/${storeSlug}`
    }

    const handleBack = () => {
        if (embedded && onBack) {
            if (step === 'account') setStep('store')
            else if (step === 'success') onBack()
            else onBack()
        } else {
            if (step === 'account') setStep('store')
            else if (step === 'success') router.push('/')
            else router.back()
        }
    }

    // Conteúdo dos steps (reaproveitado) - não alterado, apenas mantido
    const stepsContent = (
        <>
            {/* STORE STEP */}
            {step === 'store' && (
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-orange-200/50 p-6 space-y-6 shadow-sm">
                    {/* Logo */}
                    <div className="space-y-3">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 text-center">
                            Logo da Loja
                        </label>
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="w-28 h-28 mx-auto rounded-xl bg-gradient-to-br from-orange-100 to-red-100 border-2 border-orange-200 hover:border-orange-400 flex items-center justify-center cursor-pointer overflow-hidden transition-all group shadow-sm"
                        >
                            {preview ? (
                                <img src={preview} className="w-full h-full object-cover" />
                            ) : (
                                <Camera className="text-orange-500 group-hover:scale-110 transition-transform" size={32} />
                            )}
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) handleImageChange(file)
                            }}
                        />
                    </div>

                    {/* Nome da Loja */}
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                            <Store className="w-3 h-3 text-orange-500" />
                            Nome da Loja
                        </label>
                        <input
                            placeholder="Minha Super Loja"
                            value={storeName}
                            onChange={(e) => setStoreName(e.target.value)}
                            className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:border-orange-500 transition-all"
                        />
                    </div>

                    {/* Slug da Loja */}
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                            <Zap className="w-3 h-3 text-orange-500" />
                            Nome único da loja
                        </label>
                        <div className="flex items-center bg-white border-2 border-orange-200 rounded-xl overflow-hidden focus-within:border-orange-500 transition-all">
                            <span className="px-3 bg-orange-50 text-gray-600 border-r border-orange-200 text-xs font-bold py-3 whitespace-nowrap">
                                @
                            </span>
                            <input
                                placeholder="minha-loja"
                                value={storeSlug}
                                onChange={(e) =>
                                    setStoreSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                                }
                                className="flex-1 px-3 py-3 bg-white text-gray-900 text-sm outline-none"
                            />
                        </div>
                        {storeSlug && slugStatus === 'checking' && (
                            <div className="flex items-center gap-2 text-[9px] font-bold text-gray-500 mt-1">
                                <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                                Verificando...
                            </div>
                        )}
                        {storeSlug && slugStatus === 'available' && (
                            <div className="flex items-center gap-2 text-[9px] font-bold text-green-600 mt-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Link disponível
                            </div>
                        )}
                        {storeSlug && slugStatus === 'taken' && (
                            <div className="flex items-center gap-2 text-[9px] font-bold text-red-500 mt-1">
                                <AlertCircle className="w-3 h-3" />
                                Indisponível
                            </div>
                        )}
                        {storeSlugSuggestions.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                                {storeSlugSuggestions.map(sug => (
                                    <button
                                        key={sug}
                                        type="button"
                                        onClick={() => {
                                            setStoreSlug(sug)
                                            setStoreSlugSuggestions([])
                                        }}
                                        className="px-3 py-1 bg-orange-50 border border-orange-200 rounded-full text-xs font-bold text-orange-700 hover:bg-orange-100 transition-colors"
                                    >
                                        @{sug}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Descrição */}
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700">
                            Descrição
                        </label>
                        <textarea
                            placeholder="O que você vende?"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:border-orange-500 transition-all min-h-[100px]"
                        />
                    </div>

                    {/* Categoria */}
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                            <Tag className="w-3 h-3 text-orange-500" />
                            Categoria
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {CATEGORIAS_LOJAS.map((cat) => {
                                const Icon = cat.icone
                                const isSelected = selectedCategorySlug === cat.slug
                                return (
                                    <button
                                        key={cat.slug}
                                        type="button"
                                        onClick={() => setSelectedCategorySlug(cat.slug)}
                                        className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${isSelected
                                            ? 'border-orange-500 bg-orange-50 shadow-md'
                                            : 'border-orange-200 bg-white/50 hover:bg-orange-50/50'
                                            }`}
                                    >
                                        <Icon
                                            className="w-5 h-5"
                                            style={{ color: isSelected ? '#f97316' : cat.color }}
                                        />
                                        <span className={`text-[9px] font-bold ${isSelected ? 'text-orange-600' : 'text-gray-700'
                                            }`}>
                                            {cat.nome}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                        {selectedCategorySlug && (
                            <div className="flex items-center gap-2 text-[9px] font-bold text-green-600 mt-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Categoria selecionada: {CATEGORIAS_LOJAS.find(c => c.slug === selectedCategorySlug)?.nome}
                            </div>
                        )}
                    </div>

                    {/* Localização */}
                    <div className="space-y-3">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                            <MapPinned className="w-3 h-3 text-orange-500" />
                            Localização da Loja
                        </label>

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
                                    ref={searchInputRef}
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Buscar endereço..."
                                    className="flex-1 bg-transparent outline-none ml-1.5 text-xs text-gray-700"
                                    disabled={loadingLocation}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSearchAddress() }}
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={handleSearchAddress}
                                        disabled={loadingLocation}
                                        className="px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-orange-500 to-red-500 text-white"
                                    >
                                        {loadingLocation ? '...' : 'Ir'}
                                    </button>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={handleGetCurrentLocation}
                                disabled={loadingLocation}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50 flex-shrink-0"
                                style={{
                                    background: `#f9731622`,
                                    color: '#f97316',
                                    border: `1px solid #f9731644`,
                                }}
                                title="Usar GPS"
                            >
                                {usingGPS ? <Spinner size={14} /> : <Navigation size={14} />}
                                <span className="hidden sm:inline">GPS</span>
                            </button>
                        </div>

                        <div className="relative w-full h-48 sm:h-56 rounded-xl overflow-hidden"
                            style={{
                                border: `2px solid #fbd5a4`,
                                background: '#fff',
                            }}
                        >
                            <div ref={mapContainerRef} className="w-full h-full" />

                            {!mapReady && (
                                <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                                    <Spinner size={24} color='#f97316' />
                                </div>
                            )}
                        </div>

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

                        {!resolvingAddress && address && (
                            <div className="space-y-2">
                                <div className="px-3 py-2 rounded-xl"
                                    style={{
                                        background: `rgba(255,255,255,0.4)`,
                                        border: `1px solid #fbd5a4`,
                                    }}
                                >
                                    <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider opacity-50 text-gray-600 mb-1">
                                        <Hash size={12} />
                                        Número da casa/apto
                                    </label>
                                    <input
                                        type="text"
                                        value={addressNumber}
                                        onChange={(e) => setAddressNumber(e.target.value)}
                                        placeholder="Ex: 2836"
                                        className="w-full bg-transparent outline-none text-xs font-medium text-gray-700"
                                    />
                                </div>

                                <div className="px-3 py-2 rounded-xl"
                                    style={{
                                        background: `rgba(255,255,255,0.4)`,
                                        border: `1px solid #fbd5a4`,
                                    }}
                                >
                                    <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider opacity-50 text-gray-600 mb-1">
                                        <FileText size={12} />
                                        Complemento (opcional)
                                    </label>
                                    <input
                                        type="text"
                                        value={addressComplement}
                                        onChange={(e) => setAddressComplement(e.target.value)}
                                        placeholder="Ex: Casa com parede de cerâmica, portão azul..."
                                        className="w-full bg-transparent outline-none text-xs font-medium text-gray-700"
                                    />
                                </div>
                            </div>
                        )}

                        {locationError && (
                            <p className="text-red-500 text-xs font-medium">{locationError}</p>
                        )}

                        <p className="text-[10px] opacity-50 text-gray-500">
                            💡 Arraste o marcador laranja ou o mapa para ajustar a localização
                        </p>
                    </div>

                    {showLocationConfirm && (
                        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
                            <div className="w-full max-w-sm bg-white rounded-2xl p-6 space-y-4 shadow-xl">
                                <div className="flex items-center gap-2">
                                    <MapPinned className="w-5 h-5 text-orange-500" />
                                    <h3 className="font-black text-sm uppercase tracking-wider text-gray-800">Confirmar localização</h3>
                                </div>
                                <p className="text-sm text-gray-600">Essa é a localização correta?</p>
                                <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl">
                                    <p className="text-sm font-medium text-gray-800">{pendingAddress}</p>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={handleRejectLocation}
                                        className="flex-1 py-3 rounded-xl font-black uppercase text-[10px] tracking-wider border-2 border-gray-200 text-gray-600 hover:bg-gray-50 transition-all"
                                    >
                                        Não, digitar de novo
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleConfirmLocation}
                                        className="flex-1 py-3 rounded-xl font-black uppercase text-[10px] tracking-wider bg-gradient-to-r from-orange-500 to-red-500 text-white hover:shadow-lg transition-all"
                                    >
                                        Sim, está correta
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Botão avançar */}
                    <button
                        onClick={handleGoToAccount}
                        className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-black uppercase text-xs tracking-wider hover:shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                        Continuar para cadastro
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* ACCOUNT STEP */}
            {step === 'account' && (
                <form onSubmit={handleCreateAccountAndStore} className="bg-white/80 backdrop-blur-sm rounded-2xl border border-orange-200/50 p-6 space-y-6 shadow-sm">
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                        <Store className="w-4 h-4 text-orange-500" />
                        <span>Loja: <strong>{storeName}</strong> (/{storeSlug})</span>
                    </div>

                    {accountError && (
                        <div className="p-3 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl">
                            ⚠️ {accountError}
                        </div>
                    )}

                    {/* Foto de perfil (obrigatória) */}
                    <div className="flex flex-col items-center gap-1.5">
                        <div className="relative">
                            <div className="w-20 h-20 rounded-full p-[2px] bg-gradient-to-r from-orange-500 to-red-500">
                                <div className="w-full h-full rounded-full overflow-hidden bg-white flex items-center justify-center">
                                    {accountAvatarPreview ? (
                                        <img src={accountAvatarPreview} alt="Foto de perfil" className="w-full h-full object-cover" />
                                    ) : (
                                        <User className="w-8 h-8 text-orange-300" />
                                    )}
                                </div>
                            </div>
                            <input
                                type="file"
                                ref={accountAvatarInputRef}
                                onChange={handleAccountAvatarChange}
                                accept="image/*"
                                style={{ display: 'none' }}
                            />
                            <button
                                type="button"
                                onClick={() => accountAvatarInputRef.current?.click()}
                                disabled={loading}
                                className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white transition-all hover:scale-110"
                            >
                                <Camera className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <span className="text-[10px] font-bold text-gray-500">Foto de perfil (obrigatória)</span>
                    </div>

                    {/* Nome do usuário */}
                    <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-2 ml-1">
                            <User className="w-4 h-4 text-orange-500" />
                            SEU NOME
                        </label>
                        <input
                            type="text"
                            className="w-full px-4 py-3 bg-white border-2 border-orange-200 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm transition-all focus:outline-none focus:border-orange-500"
                            placeholder="Como você quer ser chamado?"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            disabled={loading}
                        />
                    </div>

                    {/* Profile Slug */}
                    <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-2 ml-1">
                            <LinkIcon className="w-4 h-4 text-orange-500" />
                            Seu @iusername único
                        </label>
                        <div className="flex items-center bg-white border-2 border-orange-200 rounded-xl overflow-hidden focus-within:border-orange-500 transition-all">
                            <span className="pl-4 pr-1 text-xs font-mono text-gray-400 bg-white py-3">
                                @
                            </span>
                            <input
                                type="text"
                                className="flex-1 py-3 pl-0 pr-4 bg-white text-gray-900 outline-none text-sm font-mono"
                                placeholder="seu-nome"
                                value={profileSlug}
                                onChange={(e) => setProfileSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                required
                                disabled={loading}
                            />
                        </div>
                        <p className="text-[11px] text-gray-500 ml-1">
                            🔗 Seu link: https://www.iuser.com.br/{profileSlug || '...'}
                        </p>
                        {profileSlugSuggestions.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                                {profileSlugSuggestions.map(sug => (
                                    <button
                                        key={sug}
                                        type="button"
                                        onClick={() => {
                                            setProfileSlug(sug)
                                            setProfileSlugSuggestions([])
                                        }}
                                        className="px-3 py-1 bg-orange-50 border border-orange-200 rounded-full text-xs font-bold text-orange-700 hover:bg-orange-100 transition-colors"
                                    >
                                        @{sug}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Email */}
                    <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-2 ml-1">
                            <Mail className="w-4 h-4 text-orange-500" />
                            E-MAIL
                        </label>
                        <input
                            type="email"
                            className="w-full px-4 py-3 bg-white border-2 border-orange-200 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm transition-all focus:outline-none focus:border-orange-500"
                            placeholder="seu@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            disabled={loading}
                        />
                    </div>

                    {/* Senhas */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-2 ml-1">
                                <Lock className="w-4 h-4 text-orange-500" />
                                SENHA
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    className="w-full px-4 py-3 bg-white border-2 border-orange-200 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm transition-all focus:outline-none focus:border-orange-500 pr-10"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    disabled={loading}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-orange-500 transition-colors"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-2 ml-1">
                                <Lock className="w-4 h-4 text-orange-500" />
                                CONFIRMAR
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    className="w-full px-4 py-3 bg-white border-2 border-orange-200 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm transition-all focus:outline-none focus:border-orange-500"
                                    placeholder="••••••••"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    disabled={loading}
                                />
                            </div>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !accountAvatarFile}
                        className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-black uppercase text-xs tracking-wider hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {loading ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                Criar conta e loja
                                <Sparkles className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </form>
            )}

            {/* SUCCESS STEP */}
            {step === 'success' && (
                <div className="text-center bg-white/80 backdrop-blur-sm rounded-2xl border border-orange-200/50 p-8 shadow-sm">
                    <div className="mb-6">
                        <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-xl">
                            <CheckCircle2 className="w-10 h-10 text-white" />
                        </div>
                    </div>
                    <h2 className="text-2xl font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent mb-2">
                        Sua loja está pronta! 🎉
                    </h2>
                    <p className="text-sm text-gray-600 mb-2">
                        Enviamos um e-mail de <strong>ativação</strong> para {email}.
                    </p>
                    <p className="text-sm text-gray-600 mb-6">
                        Após confirmar, sua loja <span className="font-mono text-xs bg-white/60 px-1 py-0.5 rounded border border-orange-200">/{storeSlug}</span> estará disponível.
                    </p>
                    <button
                        onClick={handleGoToStore}
                        className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-black uppercase text-sm tracking-wider hover:shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                        Ver minha loja
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            )}
        </>
    )

    // Modo embutido (dentro da HomePage)
    if (embedded) {
        return (
            <div className="relative z-10 max-w-2xl mx-auto px-4 py-6 w-full">
                <div className="text-center mb-6">
                    <h1 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent tracking-tighter">
                        {step === 'store' && 'Criar Loja'}
                        {step === 'account' && 'Criar Conta'}
                        {step === 'success' && 'Tudo pronto!'}
                    </h1>
                    <p className="text-[8px] font-black uppercase tracking-wider text-gray-500 mt-0.5">
                        {step === 'store' && 'Passo 1 de 2'}
                        {step === 'account' && 'Passo 2 de 2'}
                        {step === 'success' && 'Sua loja está no ar'}
                    </p>
                </div>
                {stepsContent}
            </div>
        )
    }

    // Modo standalone (página própria)
    return (
        <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 pb-32">
            <AnimatedBackground />

            <div className="relative z-10 max-w-2xl mx-auto px-4 py-6 w-full">
                <header className="flex items-center justify-between mb-6 pb-4 border-b border-orange-200/50">
                    <button
                        onClick={handleBack}
                        className="w-10 h-10 flex items-center justify-center bg-white/90 border-2 border-orange-200 rounded-xl hover:bg-gradient-to-r hover:from-orange-500 hover:to-red-500 hover:text-white transition-all"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="text-center">
                        <h1 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent tracking-tighter">
                            {step === 'store' && 'Criar Loja'}
                            {step === 'account' && 'Criar Conta'}
                            {step === 'success' && 'Tudo pronto!'}
                        </h1>
                        <p className="text-[8px] font-black uppercase tracking-wider text-gray-500 mt-0.5">
                            {step === 'store' && 'Passo 1 de 2'}
                            {step === 'account' && 'Passo 2 de 2'}
                            {step === 'success' && 'Sua loja está no ar'}
                        </p>
                    </div>
                    <div className="w-10" />
                </header>

                {stepsContent}
            </div>
        </div>
    )
}