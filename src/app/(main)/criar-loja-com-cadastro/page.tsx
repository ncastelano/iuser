//app/(main)/criar-loja-com-cadastro/page.tsx

'use client'

import { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { getCurrentPosition as getNativeCurrentPosition } from '@/lib/nativeGeolocation'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import { hexToRgb } from '@/lib/color'
import {
    Camera,
    MapPinned,
    Store,
    Sparkles,
    Zap,
    CheckCircle2,
    AlertCircle,
    ArrowLeft,
    Home,
    Tag,
    Search,
    Hash,
    FileText,
    MessageCircle,
    Shield,
    User,
    Link as LinkIcon,
    Mail,
    Lock,
    Eye,
    EyeOff,
    ArrowRight,
    IdCard,
} from 'lucide-react'
import { toast } from 'sonner'
import { getDeviceId } from '@/lib/deviceId'
import AnimatedBackground from '@/components/AnimatedBackground'
import { createSquareImage } from '@/lib/image'
import { checkSlugAvailability, getSlugSuggestions, sanitizeSlug } from '@/lib/slugUtils'
import { StoreAccessGate } from '@/components/StoreAccessGate'
import { Spinner } from '@/components/Spinner'
import Header from '@/components/Header'
import { categorias } from '@/lib/categorias'

const CATEGORIAS_LOJAS = categorias.filter(cat => cat.slug !== 'social')

type Step = 'store' | 'account' | 'access' | 'success'

interface PendingStorePayload {
    name: string
    storeSlug: string
    description: string
    logo_url: string | null
    address: string
    store_lat: number | null
    store_lng: number | null
    address_number: string
    address_complement: string | null
    category: string
    whatsapp: string
}

// Cache para geocodificação (idêntico ao /criar-loja)
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
    extractedNumber: string
}> {
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
            if (street) parts.push(number ? `${street}, ${number}` : street)
            if (neighbourhood) parts.push(neighbourhood)
            if (city) parts.push(city)
            if (state) parts.push(state)

            formatted = parts.length > 0 ? parts.join(', ') : data.display_name || ''
        }

        if (!formatted) formatted = data?.display_name || ''
        if (!formatted) formatted = `Local (${lat.toFixed(4)}, ${lng.toFixed(4)})`

        return { fullAddress: formatted, extractedNumber }
    } catch {
        return { fullAddress: `Local (${lat.toFixed(4)}, ${lng.toFixed(4)})`, extractedNumber: '' }
    }
}

// Badge animado com efeito rápido (idêntico ao /cadastrar)
function AnimatedBadge({
    words,
    icons,
    iconColor,
    currentIndex,
    shouldAnimate,
}: {
    words: string[]
    icons: React.ElementType[]
    iconColor: string
    currentIndex: number
    shouldAnimate: boolean
}) {
    const [displayIndex, setDisplayIndex] = useState(currentIndex)
    const [isAnimating, setIsAnimating] = useState(false)

    const Icon = icons[displayIndex]
    const word = words[displayIndex]

    useEffect(() => {
        if (shouldAnimate && currentIndex !== displayIndex) {
            setIsAnimating(true)
            setTimeout(() => {
                setDisplayIndex(currentIndex)
                setIsAnimating(false)
            }, 150)
        }
    }, [shouldAnimate, currentIndex, displayIndex])

    return (
        <div
            className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full h-[30px] flex-shrink-0 overflow-hidden"
            style={{ background: 'transparent', color: iconColor, minWidth: '120px', paddingLeft: '10px', paddingRight: '10px', position: 'relative' }}
        >
            <div className="relative w-3.5 h-3.5 flex-shrink-0 overflow-hidden">
                <div
                    className="absolute inset-0 flex items-center justify-center transition-all duration-150 ease-in-out"
                    style={{ transform: isAnimating ? 'translateY(-100%)' : 'translateY(0)', opacity: isAnimating ? 0 : 1 }}
                >
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                </div>
            </div>
            <div className="relative h-[16px] overflow-hidden flex-1">
                <span
                    className="absolute left-0 whitespace-nowrap transition-all duration-150 ease-in-out text-[11px]"
                    style={{ transform: isAnimating ? 'translateY(-100%)' : 'translateY(0)', opacity: isAnimating ? 0 : 1 }}
                >
                    {word}
                </span>
            </div>
        </div>
    )
}

function CriarLojaComCadastroContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { bgMode, customBgUrl } = useProfile()
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)

    const fileInputRef = useRef<HTMLInputElement | null>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)
    const [mapEl, setMapEl] = useState<HTMLDivElement | null>(null)
    const mapInstanceRef = useRef<any>(null)
    const movableMarkerRef = useRef<any>(null)
    const isMovingRef = useRef(false)
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
    const initializedRef = useRef(false)
    const gpsAskedRef = useRef(false)

    // Step control
    const [step, setStep] = useState<Step>('store')

    // ===== Dados da loja (mesmos campos e mesmo design do /criar-loja) =====
    const [storeName, setStoreName] = useState('')
    const [storeSlug, setStoreSlug] = useState('')
    const [description, setDescription] = useState('')
    const [selectedCategorySlug, setSelectedCategorySlug] = useState('')
    const [whatsapp, setWhatsapp] = useState('')
    const [whatsappError, setWhatsappError] = useState('')
    const [whatsappOrders, setWhatsappOrders] = useState(false)
    const [showWhatsapp, setShowWhatsapp] = useState(false)
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<string | null>(null)
    const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
    const [storeSlugSuggestions, setStoreSlugSuggestions] = useState<string[]>([])

    const [selectedPosition, setSelectedPosition] = useState<{ lat: number; lng: number }>({ lat: -15.7801, lng: -47.9292 })
    const [address, setAddress] = useState('')
    const [addressNumber, setAddressNumber] = useState('')
    const [addressComplement, setAddressComplement] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [resolvingAddress, setResolvingAddress] = useState(false)
    const [locationError, setLocationError] = useState('')
    const [mapReady, setMapReady] = useState(false)
    const [loadingLocation, setLoadingLocation] = useState(false)
    const [hasPicked, setHasPicked] = useState(false)
    const [showAddressSearch, setShowAddressSearch] = useState(false)
    const [showLocationConfirm, setShowLocationConfirm] = useState(false)
    const [pendingAddress, setPendingAddress] = useState('')
    const [pendingNumber, setPendingNumber] = useState('')

    // ===== Dados da conta (mesmos campos e mesmo design do /cadastrar) =====
    const [name, setName] = useState('')
    const [profileSlug, setProfileSlug] = useState('')
    const [email, setEmail] = useState('')
    const [cpfCnpj, setCpfCnpj] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [accountError, setAccountError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [accountAvatarFile, setAccountAvatarFile] = useState<File | null>(null)
    const [accountAvatarPreview, setAccountAvatarPreview] = useState<string | null>(null)
    const accountAvatarInputRef = useRef<HTMLInputElement | null>(null)

    // Badges animados (idêntico ao /cadastrar)
    const [storeIndex, setStoreIndex] = useState(0)
    const [actionIndex, setActionIndex] = useState(0)
    const [taxIndex, setTaxIndex] = useState(0)
    const [animateBadge, setAnimateBadge] = useState<'store' | 'action' | 'tax' | null>(null)
    const storeWords = ['sua loja', 'seu produto', 'seu serviço', 'sua publicação']
    const storeIcons = [Store, Sparkles, Store, Sparkles]
    const actionWords = ['venda', 'compre', 'compartilhe']
    const actionIcons = [Sparkles, Sparkles, Sparkles]
    const taxWords = ['Taxa 0%!', 'sem taxa!']
    const taxIcons = [Sparkles, Sparkles]

    useEffect(() => {
        let step = 0
        const interval = setInterval(() => {
            if (step === 0) { setStoreIndex((p) => (p + 1) % storeWords.length); setAnimateBadge('store') }
            else if (step === 1) { setActionIndex((p) => (p + 1) % actionWords.length); setAnimateBadge('action') }
            else { setTaxIndex((p) => (p + 1) % taxWords.length); setAnimateBadge('tax') }
            step = (step + 1) % 3
            setTimeout(() => setAnimateBadge(null), 200)
        }, 1500)
        return () => clearInterval(interval)
    }, [])

    // Preenchido depois que a conta é criada, usado só na etapa 'access'
    const [createdUserId, setCreatedUserId] = useState<string | null>(null)
    const [pendingStorePayload, setPendingStorePayload] = useState<PendingStorePayload | null>(null)

    const handleAccountAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setAccountAvatarFile(file)
        const reader = new FileReader()
        reader.onloadend = () => setAccountAvatarPreview(reader.result as string)
        reader.readAsDataURL(file)
    }

    // Generate store slug from name
    useEffect(() => {
        if (!storeName) { setStoreSlug(''); return }
        setStoreSlug(sanitizeSlug(storeName))
    }, [storeName])

    // Check store slug availability
    useEffect(() => {
        if (!storeSlug || step !== 'store') { setSlugStatus('idle'); setStoreSlugSuggestions([]); return }
        const check = async () => {
            setSlugStatus('checking')
            const result = await checkSlugAvailability(storeSlug, { skipProductCheck: true })
            if (!result.available) {
                setSlugStatus('taken')
                const sugs = await getSlugSuggestions(storeSlug, 3, { skipProductCheck: true })
                setStoreSlugSuggestions(sugs)
            } else {
                setSlugStatus('available')
                setStoreSlugSuggestions([])
            }
        }
        const timer = setTimeout(check, 600)
        return () => clearTimeout(timer)
    }, [storeSlug, step])

    // Image preview
    useEffect(() => {
        if (!imageFile) return
        const url = URL.createObjectURL(imageFile)
        setPreview(url)
        return () => URL.revokeObjectURL(url)
    }, [imageFile])

    // ===== Mapa (idêntico ao /criar-loja) =====
    useEffect(() => {
        if (typeof window === 'undefined' || !mapEl || initializedRef.current) return
        initializedRef.current = true

        const initMap = async () => {
            const L = (await import('leaflet')).default
            await import('leaflet/dist/leaflet.css')

            delete (L.Icon.Default.prototype as any)._getIconUrl
            L.Icon.Default.mergeOptions({ iconRetinaUrl: '', iconUrl: '', shadowUrl: '' })

            const map = L.map(mapEl, {
                center: [selectedPosition.lat, selectedPosition.lng],
                zoom: 4,
                zoomControl: true,
                attributionControl: false,
            })

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)

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
                setHasPicked(true)
                setResolvingAddress(true)
                setLocationError('')
                reverseGeocode(newPos.lat, newPos.lng).then(result => {
                    setAddress(result.fullAddress)
                    if (result.extractedNumber && !addressNumber) setAddressNumber(result.extractedNumber)
                    setResolvingAddress(false)
                })
            })

            mapInstanceRef.current = map
            movableMarkerRef.current = movableMarker

            map.on('moveend', () => {
                if (isMovingRef.current) { isMovingRef.current = false; return }
                const center = map.getCenter()
                const newPos = { lat: center.lat, lng: center.lng }
                movableMarker.setLatLng([newPos.lat, newPos.lng])
                setSelectedPosition(newPos)
                setHasPicked(true)

                if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
                setResolvingAddress(true)
                setLocationError('')

                debounceTimerRef.current = setTimeout(async () => {
                    try {
                        const result = await reverseGeocode(newPos.lat, newPos.lng)
                        setAddress(result.fullAddress)
                        if (result.extractedNumber && !addressNumber) setAddressNumber(result.extractedNumber)
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
            if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null }
            initializedRef.current = false
            setMapReady(false)
        }
    }, [mapEl])

    const flyTo = useCallback((lat: number, lng: number) => {
        if (!mapInstanceRef.current || !movableMarkerRef.current) return
        isMovingRef.current = true
        mapInstanceRef.current.flyTo([lat, lng], 16, { duration: 0.8 })
        movableMarkerRef.current.setLatLng([lat, lng])
    }, [])

    const handleGetCurrentLocation = () => {
        setLoadingLocation(true)
        setLocationError('')

        getNativeCurrentPosition(
            async (pos) => {
                const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude }
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
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        )
    }

    // Ao entrar na etapa 'store', pede a permissão de localização e já coloca o pin onde a pessoa está.
    useEffect(() => {
        if (!mapReady || gpsAskedRef.current) return
        gpsAskedRef.current = true
        getNativeCurrentPosition(
            async (pos) => {
                const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude }
                setSelectedPosition(newPos)
                setHasPicked(true)
                if (mapInstanceRef.current && movableMarkerRef.current) {
                    isMovingRef.current = true
                    mapInstanceRef.current.flyTo([newPos.lat, newPos.lng], 17, { duration: 0.8 })
                    movableMarkerRef.current.setLatLng([newPos.lat, newPos.lng])
                }
                setResolvingAddress(true)
                try {
                    const result = await reverseGeocode(newPos.lat, newPos.lng)
                    setAddress(result.fullAddress)
                    if (result.extractedNumber) setAddressNumber(prev => prev || result.extractedNumber)
                } catch {
                    setAddress(`Local (${newPos.lat.toFixed(4)}, ${newPos.lng.toFixed(4)})`)
                } finally {
                    setResolvingAddress(false)
                }
            },
            () => setLocationError('Sem acesso à sua localização. Arraste o pin no mapa ou escreva o endereço.'),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        )
    }, [mapReady])

    const handleSearchAddress = async () => {
        if (!searchQuery.trim()) return
        setLoadingLocation(true)
        setLocationError('')

        const result = await geocodeAddress(searchQuery.trim())

        if (result) {
            setSelectedPosition({ lat: result.lat, lng: result.lng })
            setHasPicked(true)
            flyTo(result.lat, result.lng)
            setPendingAddress(result.address)
            setPendingNumber('')
            setShowLocationConfirm(true)
        } else {
            setLocationError('Endereço não encontrado.')
        }

        setLoadingLocation(false)
    }

    // Sem busca automática enquanto digita: com endereços longos, uma pausa
    // no meio da digitação (ex: parou pra pensar no número) já disparava a
    // busca com o endereço incompleto. Busca só ao apertar Enter ou "Ir".

    const handleConfirmLocation = () => {
        setAddress(pendingAddress)
        setLocationError('')
        if (pendingNumber) setAddressNumber(prev => prev || pendingNumber)
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

    const handleWhatsAppChange = (value: string) => {
        const cleaned = value.replace(/[^0-9+\s()-]/g, '')
        setWhatsapp(cleaned)

        if (cleaned.replace(/\D/g, '').length > 0) {
            const clean = cleaned.replace(/\D/g, '')
            if (clean.length < 10) setWhatsappError('Número incompleto. Digite DDD + número')
            else if (clean.length > 13) setWhatsappError('Número muito longo')
            else setWhatsappError('')
        } else {
            setWhatsappError('')
        }
    }

    const handleImageChange = async (file: File) => {
        try {
            const squareFile = await createSquareImage(file, 400)
            setImageFile(squareFile)
        } catch {
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
        if (!hasPicked) {
            toast.error('Marque a localização da loja no mapa')
            return
        }
        const whatsappClean = whatsapp.replace(/\D/g, '')
        if (!whatsappClean || whatsappClean.length < 10) {
            toast.error('Digite um número de WhatsApp válido com DDD')
            return
        }
        if (whatsappClean.length > 13) {
            toast.error('Número de WhatsApp inválido')
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

        const cleanCpfCnpj = cpfCnpj.replace(/\D/g, '')
        if (cleanCpfCnpj.length !== 11 && cleanCpfCnpj.length !== 14) {
            setAccountError('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido')
            setLoading(false)
            return
        }

        if (!profileSlug || !/^[a-z0-9-]+$/.test(profileSlug)) {
            setAccountError('Seu link de perfil deve conter apenas letras minúsculas, números e hifens (-)')
            setLoading(false)
            return
        }

        if (profileSlug === storeSlug) {
            setAccountError('O link do seu perfil não pode ser igual ao link da sua loja')
            setLoading(false)
            return
        }

        try {
            // 1. Verificar disponibilidade do profileSlug
            const profileCheck = await checkSlugAvailability(profileSlug, { skipProductCheck: true })
            if (!profileCheck.available) {
                setAccountError(profileCheck.message || 'Este link de perfil já está em uso')
                setLoading(false)
                return
            }

            // 1.1 Verificar disponibilidade do storeSlug
            const storeCheck = await checkSlugAvailability(storeSlug, { skipProductCheck: true })
            if (!storeCheck.available) {
                setAccountError(storeCheck.message || 'Este link de loja já está em uso')
                setLoading(false)
                return
            }

            // 1.2 Descobrir upline (quem indicou) — via ?ref= ou cookie de indicação;
            // sem indicação de ninguém, vira indicado do admin por padrão.
            let referralSlug = null
            const refParam = searchParams.get('ref')
            if (refParam) {
                referralSlug = refParam
            } else {
                try {
                    const res = await fetch('/api/get-referral-cookie')
                    const data = await res.json()
                    referralSlug = data.referralSlug || null
                } catch (error) {
                    console.error('Erro ao ler cookie:', error)
                }
            }

            let uplineId = null
            if (referralSlug) {
                const { data: upline } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('profileSlug', referralSlug)
                    .maybeSingle()
                if (upline) uplineId = upline.id
            }

            if (!uplineId) {
                const { data: adminProfile } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('email', 'ncastelano@gmail.com')
                    .maybeSingle()
                if (adminProfile) uplineId = adminProfile.id
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
                    upline_id: uplineId,
                    cpf_cnpj: cleanCpfCnpj,
                    avatar_url: accountAvatarUrl,
                })
            if (profileError) {
                console.error('Erro ao criar perfil:', profileError)
                throw new Error('Erro ao criar perfil')
            }

            try {
                await fetch('/api/clear-referral-cookie', { method: 'POST' })
            } catch (error) {
                console.error('Erro ao limpar cookie:', error)
            }

            // 3.1 Ativa o plano Pós-pago automaticamente — assim o gate de
            // "assine pra criar loja" (StoreAccessGate, etapa seguinte) já
            // passa direto, sem precisar visitar /planos.
            try {
                const { data: { session: newSession } } = await supabase.auth.getSession()
                const { data: posPagoPlan } = await supabase.from('plans').select('id').eq('code', 'pos_pago').maybeSingle()
                if (newSession && posPagoPlan) {
                    const activateRes = await fetch('/api/subscriptions/purchase', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${newSession.access_token}` },
                        body: JSON.stringify({ planId: posPagoPlan.id, cpfCnpj: cleanCpfCnpj, deviceId: getDeviceId() }),
                    })
                    if (!activateRes.ok) {
                        const activateJson = await activateRes.json().catch(() => ({}))
                        toast.error(activateJson.error || 'Não deu pra ativar o Pós-pago agora — você ainda precisa assinar um plano na próxima etapa.')
                    }
                }
            } catch (postpaidErr) {
                console.error('Erro ao ativar Pós-pago automaticamente:', postpaidErr)
            }

            // 4. Upload da logo (se houver)
            let logoPath: string | null = null
            if (imageFile) {
                const fileExt = imageFile.name.split('.').pop()
                const fileName = `${Date.now()}.${fileExt}`
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('store-logos')
                    .upload(fileName, imageFile)
                if (uploadError) console.error('Erro no upload:', uploadError)
                if (uploadData) logoPath = uploadData.path
            }

            // 5. Monta o payload da loja com os mesmos parâmetros do /criar-loja
            const categoriaSelecionada = CATEGORIAS_LOJAS.find(c => c.slug === selectedCategorySlug)
            const categoryName = categoriaSelecionada?.nome || selectedCategorySlug
            const whatsappClean = whatsapp.replace(/\D/g, '')

            let fullAddress = address
            if (addressNumber && !address.includes(addressNumber)) {
                const firstCommaIndex = fullAddress.indexOf(',')
                if (firstCommaIndex !== -1) {
                    fullAddress = fullAddress.slice(0, firstCommaIndex) + `, ${addressNumber}` + fullAddress.slice(firstCommaIndex)
                }
            }

            // 6. Conta e perfil prontos - a loja em si só é criada depois que o
            // acesso for liberado (etapa 'access' abaixo), porque a criação
            // de loja exige assinatura ativa.
            setCreatedUserId(userId)
            setPendingStorePayload({
                name: storeName,
                storeSlug,
                description,
                logo_url: logoPath,
                address: fullAddress,
                store_lat: selectedPosition.lat,
                store_lng: selectedPosition.lng,
                address_number: addressNumber,
                address_complement: addressComplement || null,
                category: categoryName,
                whatsapp: whatsappClean,
            })
            setStep('access')
        } catch (err: any) {
            setAccountError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const finalizeStoreCreation = async () => {
        if (!pendingStorePayload) return
        setLoading(true)
        try {
            const { error } = await supabase.rpc('create_store_with_access', {
                p_store: pendingStorePayload,
            })
            if (error) throw error

            // Os dois começam desmarcados: grava explicitamente a escolha da pessoa.
            await supabase
                .from('stores')
                .update({ whatsapp_orders_enabled: whatsappOrders, show_whatsapp: showWhatsapp })
                .eq('storeSlug', pendingStorePayload.storeSlug)

            setStep('success')
        } catch (err: any) {
            toast.error(err.message || 'Erro ao criar a loja')
        } finally {
            setLoading(false)
        }
    }

    const handleGoToStore = () => {
        router.push(`/${profileSlug}/${storeSlug}`)
    }

    // ===================================================================
    // ETAPA 'account' — mesmo design do /cadastrar (card escuro flutuante)
    // ===================================================================
    if (step === 'account') {
        return (
            <div className="relative flex flex-col min-h-screen pb-32" style={{ background: colors.background }}>
                <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
                    <form onSubmit={handleCreateAccountAndStore} className="w-full max-w-md">
                        <div
                            className="rounded-3xl p-8 flex flex-col gap-6"
                            style={{
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                                backdropFilter: 'blur(12px)',
                                WebkitBackdropFilter: 'blur(12px)',
                                border: `1px solid ${colors.border}`,
                                boxShadow: colors.shadow,
                            }}
                        >
                            <div>
                                <button
                                    type="button"
                                    onClick={() => setStep('store')}
                                    className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider transition-opacity hover:opacity-70"
                                    style={{ color: colors.textSecondary }}
                                >
                                    <ArrowLeft className="w-3.5 h-3.5" />
                                    Voltar pros dados da loja
                                </button>
                            </div>

                            <div className="text-center">
                                <div
                                    className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
                                    style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)', color: '#ffffff', boxShadow: `0 4px 14px #f9731640` }}
                                >
                                    <img src="/logotransparente.png" alt="iUser" className="w-12 h-12 object-contain" />
                                </div>

                                <h1 className="text-2xl font-black" style={{ color: colors.textPrimary }}>Crie sua conta</h1>
                                <p className="text-sm" style={{ color: colors.textSecondary }}>
                                    Loja: <strong>{storeName}</strong> (/{storeSlug})
                                </p>

                                <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
                                    <AnimatedBadge words={storeWords} icons={storeIcons} iconColor={colors.accent} currentIndex={storeIndex} shouldAnimate={animateBadge === 'store'} />
                                    <AnimatedBadge words={actionWords} icons={actionIcons} iconColor={colors.accent} currentIndex={actionIndex} shouldAnimate={animateBadge === 'action'} />
                                    <AnimatedBadge words={taxWords} icons={taxIcons} iconColor={colors.accent} currentIndex={taxIndex} shouldAnimate={animateBadge === 'tax'} />
                                </div>
                            </div>

                            {accountError && (
                                <div className="p-3 text-xs font-bold rounded-xl flex items-start gap-2" style={{ background: '#ef444420', border: `1px solid #ef444430`, color: '#ef4444' }}>
                                    <span>⚠️</span>
                                    <span>{accountError}</span>
                                </div>
                            )}

                            <div className="space-y-4">
                                <div className="flex flex-col items-center gap-1.5">
                                    <div className="relative">
                                        <div className="w-20 h-20 rounded-full p-[2px]" style={{ background: colors.accent }}>
                                            <div className="w-full h-full rounded-full overflow-hidden bg-white flex items-center justify-center">
                                                {accountAvatarPreview ? (
                                                    <img src={accountAvatarPreview} alt="Foto de perfil" className="w-full h-full object-cover" />
                                                ) : (
                                                    <User className="w-8 h-8" style={{ color: colors.accent, opacity: 0.4 }} />
                                                )}
                                            </div>
                                        </div>
                                        <input type="file" ref={accountAvatarInputRef} onChange={handleAccountAvatarChange} accept="image/*" style={{ display: 'none' }} />
                                        <button
                                            type="button"
                                            onClick={() => accountAvatarInputRef.current?.click()}
                                            disabled={loading}
                                            className="absolute -bottom-1 -right-1 p-1.5 rounded-full transition-all hover:scale-110"
                                            style={{ background: colors.accent, color: '#fff' }}
                                        >
                                            <Camera size={14} />
                                        </button>
                                    </div>
                                    <span className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>Foto de perfil (obrigatória)</span>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-wider flex items-center gap-2" style={{ color: colors.textSecondary }}>
                                        <User className="w-3.5 h-3.5" style={{ color: colors.accent }} />
                                        Nome
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 rounded-xl text-sm transition-all focus:outline-none focus:ring-2"
                                        style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`, border: `2px solid ${colors.border}`, color: colors.textPrimary, '--tw-ring-color': colors.accent } as React.CSSProperties}
                                        placeholder="Como você quer ser chamado?"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        required
                                        disabled={loading}
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-wider flex items-center gap-2" style={{ color: colors.textSecondary }}>
                                        <LinkIcon className="w-3.5 h-3.5" style={{ color: colors.accent }} />
                                        Seu link de perfil
                                    </label>
                                    <div
                                        className="flex items-center rounded-xl transition-all overflow-hidden focus-within:ring-2"
                                        style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`, border: `2px solid ${colors.border}`, '--tw-ring-color': colors.accent } as React.CSSProperties}
                                    >
                                        <span className="pl-4 pr-1 text-xs font-mono py-3" style={{ color: colors.textSecondary }}>iuser.com.br/</span>
                                        <input
                                            type="text"
                                            className="flex-1 py-3 pl-0 pr-4 outline-none text-sm font-mono"
                                            style={{ background: 'transparent', color: colors.textPrimary }}
                                            placeholder="seu-nome"
                                            value={profileSlug}
                                            onChange={(e) => setProfileSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                            required
                                            disabled={loading}
                                        />
                                    </div>
                                    <p className="text-[10px]" style={{ color: colors.textSecondary }}>
                                        Seu link público: <span className="font-mono font-bold" style={{ color: colors.accent }}>/{profileSlug || 'seu-nome'}</span>
                                    </p>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-wider flex items-center gap-2" style={{ color: colors.textSecondary }}>
                                        <Mail className="w-3.5 h-3.5" style={{ color: colors.accent }} />
                                        E-mail
                                    </label>
                                    <input
                                        type="email"
                                        className="w-full px-4 py-3 rounded-xl text-sm transition-all focus:outline-none focus:ring-2"
                                        style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`, border: `2px solid ${colors.border}`, color: colors.textPrimary, '--tw-ring-color': colors.accent } as React.CSSProperties}
                                        placeholder="seu@email.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        disabled={loading}
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-wider flex items-center gap-2" style={{ color: colors.textSecondary }}>
                                        <IdCard className="w-3.5 h-3.5" style={{ color: colors.accent }} />
                                        CPF ou CNPJ
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        className="w-full px-4 py-3 rounded-xl text-sm transition-all focus:outline-none focus:ring-2"
                                        style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`, border: `2px solid ${colors.border}`, color: colors.textPrimary, '--tw-ring-color': colors.accent } as React.CSSProperties}
                                        placeholder="Só números"
                                        value={cpfCnpj}
                                        onChange={(e) => setCpfCnpj(e.target.value)}
                                        required
                                        disabled={loading}
                                    />
                                    <p className="text-[10px]" style={{ color: colors.textSecondary }}>
                                        Necessário para ativar o plano Pós-pago (sem mensalidade).
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black uppercase tracking-wider flex items-center gap-2" style={{ color: colors.textSecondary }}>
                                            <Lock className="w-3.5 h-3.5" style={{ color: colors.accent }} />
                                            Senha
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                className="w-full px-4 py-3 rounded-xl text-sm transition-all focus:outline-none focus:ring-2 pr-10"
                                                style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`, border: `2px solid ${colors.border}`, color: colors.textPrimary, '--tw-ring-color': colors.accent } as React.CSSProperties}
                                                placeholder="••••••••"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                required
                                                disabled={loading}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                                                style={{ color: colors.textSecondary }}
                                            >
                                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black uppercase tracking-wider flex items-center gap-2" style={{ color: colors.textSecondary }}>
                                            <Lock className="w-3.5 h-3.5" style={{ color: colors.accent }} />
                                            Confirmar
                                        </label>
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            className="w-full px-4 py-3 rounded-xl text-sm transition-all focus:outline-none focus:ring-2"
                                            style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`, border: `2px solid ${colors.border}`, color: colors.textPrimary, '--tw-ring-color': colors.accent } as React.CSSProperties}
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
                                className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50"
                                style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)', color: '#ffffff', boxShadow: `0 4px 14px #f9731640` }}
                            >
                                {loading ? <Spinner size={20} /> : (
                                    <>
                                        Criar conta e continuar
                                        <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )
    }

    // ===================================================================
    // ETAPAS 'store' / 'access' / 'success' — mesmo design do /criar-loja
    // ===================================================================
    return (
        <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 pb-32">
            <div className="fixed inset-0 z-0">
                <AnimatedBackground bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh" style={{ overscrollBehavior: 'none' }}>
                <Header
                    title="iUser"
                    showBack={false}
                    greeting="Criar loja"
                    avatarUrl={null}
                    loading={false}
                    showSearch={false}
                    onHomeClick={() => router.push('/')}
                />

                <div className="w-full px-4 md:px-6 py-6">
                    {/* STORE STEP */}
                    {step === 'store' && (
                        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-orange-200/50 p-6 space-y-6 shadow-sm">
                            {/* LOGO */}
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

                            {/* NOME DA LOJA */}
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                                    <Store className="w-3 h-3 text-orange-500" />
                                    Nome da Loja *
                                </label>
                                <input
                                    placeholder="Minha Super Loja"
                                    value={storeName}
                                    onChange={(e) => setStoreName(e.target.value)}
                                    className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:border-orange-500 transition-all"
                                    required
                                />
                            </div>

                            {/* SLUG */}
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                                    <Zap className="w-3 h-3 text-orange-500" />
                                    Nome único da loja *
                                </label>
                                <div className="flex items-center bg-white border-2 border-orange-200 rounded-xl overflow-hidden focus-within:border-orange-500 transition-all">
                                    <span className="px-3 bg-orange-50 text-gray-600 border-r border-orange-200 text-xs font-bold py-3 whitespace-nowrap">@</span>
                                    <input
                                        placeholder="minha-loja"
                                        value={storeSlug}
                                        onChange={(e) => setStoreSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
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
                                                onClick={() => { setStoreSlug(sug); setStoreSlugSuggestions([]) }}
                                                className="px-3 py-1 bg-orange-50 border border-orange-200 rounded-full text-xs font-bold text-orange-700 hover:bg-orange-100 transition-colors"
                                            >
                                                @{sug}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* WHATSAPP */}
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                                    <MessageCircle className="w-3 h-3 text-green-500" />
                                    WhatsApp da Loja *
                                </label>
                                <div className="relative">
                                    <div className="flex items-center bg-white border-2 rounded-xl overflow-hidden focus-within:border-orange-500 transition-all" style={{ borderColor: whatsappError ? '#ef4444' : '#fbd5a4' }}>
                                        <span className="px-3 bg-green-50 text-gray-600 border-r border-green-200 text-xs font-bold py-3 whitespace-nowrap flex items-center gap-1">
                                            <MessageCircle className="w-3 h-3 text-green-500" />
                                            +55
                                        </span>
                                        <input
                                            placeholder="(11) 99999-9999"
                                            value={whatsapp}
                                            onChange={(e) => handleWhatsAppChange(e.target.value)}
                                            className="flex-1 px-3 py-3 bg-white text-gray-900 text-sm outline-none"
                                            maxLength={18}
                                        />
                                    </div>
                                    {whatsappError && (
                                        <div className="flex items-center gap-2 text-[9px] font-bold text-red-500 mt-1">
                                            <AlertCircle className="w-3 h-3" />
                                            {whatsappError}
                                        </div>
                                    )}
                                    {!whatsappError && whatsapp.replace(/\D/g, '').length >= 10 && (
                                        <div className="flex items-center gap-2 text-[9px] font-bold text-green-600 mt-1">
                                            <CheckCircle2 className="w-3 h-3" />
                                            Número válido!
                                            {whatsapp.replace(/\D/g, '').length >= 11 ? ' Celular' : ' Telefone'}
                                        </div>
                                    )}
                                    <div className="flex items-start gap-1.5 mt-1.5">
                                        <Shield className="w-3 h-3 text-orange-400 flex-shrink-0 mt-0.5" />
                                        <p className="text-[8px] text-gray-400 leading-relaxed">
                                            Você escolhe abaixo se este número aparece na página da loja.
                                        </p>
                                    </div>
                                    <div className="mt-2 p-3 rounded-xl border" style={{ borderColor: '#fbd5a4', background: '#fff7ed' }}>
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-gray-700">
                                                Mostrar o WhatsApp na página da loja
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setShowWhatsapp(!showWhatsapp)}
                                                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${showWhatsapp ? 'bg-orange-500' : 'bg-gray-400'}`}
                                            >
                                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${showWhatsapp ? 'right-1' : 'left-1'}`} />
                                            </button>
                                        </div>
                                        <p className="text-[9px] text-gray-500 leading-relaxed mt-1.5">
                                            {showWhatsapp
                                                ? 'Os clientes veem o número e o botão de WhatsApp na página da loja.'
                                                : 'O número fica escondido: os clientes não veem o WhatsApp na página da loja.'}
                                        </p>
                                    </div>
                                    <div className="mt-2 p-3 rounded-xl border" style={{ borderColor: '#fbd5a4', background: '#fff7ed' }}>
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-gray-700">
                                                Receber pedidos também no WhatsApp (opcional)
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setWhatsappOrders(!whatsappOrders)}
                                                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${whatsappOrders ? 'bg-orange-500' : 'bg-gray-400'}`}
                                            >
                                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${whatsappOrders ? 'right-1' : 'left-1'}`} />
                                            </button>
                                        </div>
                                        <p className="text-[9px] text-gray-500 leading-relaxed mt-1.5">
                                            {whatsappOrders
                                                ? 'Ao finalizar, o cliente é direcionado direto ao WhatsApp da loja para enviar o pedido. Quando a mensagem chegar no WhatsApp, o pedido já terá aparecido no iUser: verifique os pedidos na aba onde fica a sua loja.'
                                                : 'Os pedidos chegam só pelo iUser, na aba onde fica a sua loja. O cliente não será levado ao WhatsApp.'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* CATEGORIA */}
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                                    <Tag className="w-3 h-3 text-orange-500" />
                                    Categoria *
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
                                                className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${isSelected ? 'border-orange-500 bg-orange-50 shadow-md' : 'border-orange-200 bg-white/50 hover:bg-orange-50/50'}`}
                                            >
                                                <Icon className="w-5 h-5" style={{ color: isSelected ? '#f97316' : cat.color }} />
                                                <span className={`text-[9px] font-bold ${isSelected ? 'text-orange-600' : 'text-gray-700'}`}>{cat.nome}</span>
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

                            {/* DESCRIÇÃO */}
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700">Descrição</label>
                                <textarea
                                    placeholder="O que você vende? (opcional)"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:border-orange-500 transition-all min-h-[100px]"
                                />
                            </div>

                            {/* LOCALIZAÇÃO (idêntico ao /criar-loja) */}
                            <div className="space-y-3">
                                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                                    <MapPinned className="w-3 h-3 text-orange-500" />
                                    Localização da Loja *
                                </label>

                                <div className="relative w-full h-64 sm:h-72 rounded-xl overflow-hidden" style={{ border: `2px solid #fbd5a4`, background: '#fff' }}>
                                    <div ref={setMapEl} className="w-full h-full" />
                                    {!mapReady && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                                            <Spinner size={24} color="#f97316" />
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-start gap-2.5 px-4 py-3 rounded-2xl shadow-md" style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)' }}>
                                    <div className="flex-shrink-0 mt-0.5">
                                        <div className="w-7 h-7 rounded-full bg-white/25 flex items-center justify-center">
                                            <MapPinned size={15} color="#ffffff" />
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-white/80">Localização selecionada</span>
                                        {resolvingAddress ? (
                                            <p className="text-xs mt-0.5 text-white/80">Obtendo endereço...</p>
                                        ) : (
                                            <p className="text-sm font-bold mt-0.5 break-words leading-relaxed text-white">
                                                {address || 'Arraste o marcador ou mova o mapa'}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => { setShowAddressSearch(v => !v); setTimeout(() => searchInputRef.current?.focus(), 150) }}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-full text-sm font-bold text-white shadow-md hover:scale-[1.01] transition-transform"
                                    style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)' }}
                                >
                                    <Search size={15} />
                                    Escrever endereço...
                                </button>

                                {showAddressSearch && (
                                    <div className="flex items-center px-2 py-1 rounded-full bg-white border-2 border-orange-200">
                                        <input
                                            ref={searchInputRef}
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Rua, número, bairro, cidade..."
                                            className="flex-1 bg-transparent outline-none ml-2 text-sm text-gray-700"
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
                                )}

                                <button
                                    type="button"
                                    onClick={handleGetCurrentLocation}
                                    disabled={loadingLocation}
                                    className="w-full flex items-center justify-center gap-2 py-3 bg-orange-50 text-orange-700 border-2 border-orange-200 rounded-xl font-black uppercase text-[9px] tracking-wider hover:bg-orange-100 transition-all"
                                >
                                    <MapPinned size={14} />
                                    Usar minha localização atual
                                </button>

                                <p className="text-center text-xs font-semibold text-gray-500">
                                    ou arraste o pin no mapa para selecionar a localização
                                </p>

                                {!resolvingAddress && address && (
                                    <div className="space-y-2">
                                        <div className="px-3 py-2 rounded-xl" style={{ background: `rgba(255,255,255,0.4)`, border: `1px solid #fbd5a4` }}>
                                            <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider opacity-50 text-gray-600 mb-1">
                                                <Hash size={12} />
                                                Número da casa/apto *
                                            </label>
                                            <input
                                                type="text"
                                                value={addressNumber}
                                                onChange={(e) => setAddressNumber(e.target.value)}
                                                placeholder="Ex: 2836"
                                                className="w-full bg-transparent outline-none text-xs font-medium text-gray-700"
                                                required
                                            />
                                        </div>

                                        <div className="px-3 py-2 rounded-xl" style={{ background: `rgba(255,255,255,0.4)`, border: `1px solid #fbd5a4` }}>
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

                                {locationError && <p className="text-red-500 text-xs font-medium">{locationError}</p>}
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

                            {/* BOTÃO AVANÇAR */}
                            <button
                                onClick={handleGoToAccount}
                                className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-black uppercase text-xs tracking-wider hover:shadow-lg transition-all flex items-center justify-center gap-2"
                            >
                                <Sparkles className="w-4 h-4" />
                                Continuar para cadastro
                            </button>

                            <div className="flex flex-wrap gap-3 justify-center text-[9px] text-gray-400">
                                <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" />Nome</span>
                                <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" />Link</span>
                                <span className="flex items-center gap-1">
                                    {whatsapp.replace(/\D/g, '').length >= 10 ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <AlertCircle className="w-3 h-3 text-red-400" />}
                                    WhatsApp
                                </span>
                                <span className="flex items-center gap-1">
                                    {selectedCategorySlug ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <AlertCircle className="w-3 h-3 text-red-400" />}
                                    Categoria
                                </span>
                                <span className="flex items-center gap-1">
                                    {addressNumber ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <AlertCircle className="w-3 h-3 text-red-400" />}
                                    Localização
                                </span>
                            </div>
                        </div>
                    )}

                    {/* ACCESS STEP - libera a loja (assinatura) antes de criar de verdade */}
                    {step === 'access' && (
                        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-orange-200/50 p-6 space-y-5 shadow-sm">
                            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-500">
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                Conta criada! Falta liberar a loja "{storeName}"
                            </div>
                            <StoreAccessGate userId={createdUserId}>
                                <div className="space-y-4">
                                    <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl text-sm text-gray-700">
                                        Acesso liberado! Agora é só confirmar a criação da loja <strong>{storeName}</strong>.
                                    </div>
                                    <button
                                        type="button"
                                        onClick={finalizeStoreCreation}
                                        disabled={loading}
                                        className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-black uppercase text-xs tracking-wider hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {loading ? <Spinner size={16} color="#fff" /> : (
                                            <>
                                                Criar loja
                                                <Sparkles className="w-4 h-4" />
                                            </>
                                        )}
                                    </button>
                                </div>
                            </StoreAccessGate>
                        </div>
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
                </div>

                <div style={{ position: 'fixed', bottom: 32, right: 24, display: 'flex', gap: 12, zIndex: 998 }}>
                    <button
                        onClick={() => router.back()}
                        className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
                        style={{ background: `linear-gradient(135deg, #f97316, #ef4444)`, color: '#ffffff', border: `2px solid #f97316`, boxShadow: `0 8px 24px #f9731660` }}
                        aria-label="Voltar para a página anterior"
                    >
                        <ArrowLeft size={24} />
                    </button>
                    <button
                        onClick={() => router.push('/')}
                        className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
                        style={{ background: `linear-gradient(135deg, #f97316, #ef4444)`, color: '#ffffff', border: `2px solid #f97316`, boxShadow: `0 8px 24px #f9731660` }}
                        aria-label="Ir para o início"
                    >
                        <Home size={24} />
                    </button>
                </div>
            </main>
        </div>
    )
}

export default function CriarLojaComCadastro() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center" style={{ background: '#000' }}>
                <div className="text-center">
                    <Spinner size={48} color="#f97316" className="mx-auto mb-4" />
                    <p className="text-sm font-bold" style={{ color: '#ffffff' }}>Carregando...</p>
                </div>
            </div>
        }>
            <CriarLojaComCadastroContent />
        </Suspense>
    )
}
