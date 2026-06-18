//app/(main)/criar-loja-com-cadastro/page.tsx

'use client'

import { useState, useRef, useEffect } from 'react'
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
    ChevronLeft,
    ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import AnimatedBackground from '@/components/AnimatedBackground'
import { createSquareImage } from '@/lib/image'

type Step = 'store' | 'account' | 'success'

export default function CriarLojaComCadastro() {
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement | null>(null)

    // Step control
    const [step, setStep] = useState<Step>('store')

    // Store data
    const [storeName, setStoreName] = useState('')
    const [storeSlug, setStoreSlug] = useState('')
    const [description, setDescription] = useState('')
    const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
    const [address, setAddress] = useState('')
    const [manualAddress, setManualAddress] = useState('')
    const [editingAddress, setEditingAddress] = useState(false)
    const [suggestions, setSuggestions] = useState<any[]>([])
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<string | null>(null)

    // Slug check for store
    const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')

    // Account data
    const [name, setName] = useState('')
    const [profileSlug, setProfileSlug] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [accountError, setAccountError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    // Slug auto-generation for store
    useEffect(() => {
        if (!storeName) {
            setStoreSlug('')
            return
        }
        const slug = storeName
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)+/g, '')
        setStoreSlug(slug)
    }, [storeName])

    // Check store slug availability
    useEffect(() => {
        if (!storeSlug || step !== 'store') {
            setSlugStatus('idle')
            return
        }
        const check = async () => {
            setSlugStatus('checking')
            const { data } = await supabase
                .from('stores')
                .select('id')
                .eq('storeSlug', storeSlug)
                .limit(1)
                .maybeSingle()
            if (data) {
                setSlugStatus('taken')
                setStoreSlug(`${storeSlug}-${Math.floor(Math.random() * 9999)}`)
            } else {
                setSlugStatus('available')
            }
        }
        const timer = setTimeout(check, 600)
        return () => clearTimeout(timer)
    }, [storeSlug, step, supabase])

    // Image preview
    useEffect(() => {
        if (!imageFile) return
        const url = URL.createObjectURL(imageFile)
        setPreview(url)
        return () => URL.revokeObjectURL(url)
    }, [imageFile])

    // Address autocomplete
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
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
                    query
                )}.json?access_token=${token}&autocomplete=true&country=BR&limit=5`
            )
            const data = await res.json()
            setSuggestions(data.features || [])
        } catch (e) {
            console.error(e)
        }
    }

    const selectSuggestion = (feature: any) => {
        const [lng, lat] = feature.center
        setLocation({ lat, lng })
        setAddress(feature.place_name)
        setManualAddress(feature.place_name)
        setSuggestions([])
        setEditingAddress(false)
    }

    const fetchAddressFromCoords = async (lat: number, lng: number) => {
        try {
            const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
            const res = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}`
            )
            const data = await res.json()
            if (data.features?.length > 0) {
                setAddress(data.features[0].place_name)
            }
        } catch (e) {
            console.error(e)
        }
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

        if (!profileSlug || !/^[a-z0-9-]+$/.test(profileSlug)) {
            setAccountError('Seu link de perfil deve conter apenas letras minúsculas, números e hifens (-)')
            setLoading(false)
            return
        }

        try {
            // 1. Verificar disponibilidade do profileSlug
            const { data: existingProfile } = await supabase
                .from('profiles')
                .select('id')
                .eq('profileSlug', profileSlug)
                .single()
            if (existingProfile) {
                setAccountError('Este link de perfil já está em uso')
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

            // 3. Criar perfil
            const { error: profileError } = await supabase
                .from('profiles')
                .upsert({
                    id: userId,
                    name: name,
                    profileSlug: profileSlug,
                })
            if (profileError) {
                console.error('Erro ao criar perfil:', profileError)
                // ainda podemos tentar criar a loja mesmo se perfil falhar? Melhor parar.
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

            // 5. Criar loja
            const { error: storeError } = await supabase.from('stores').insert({
                name: storeName,
                storeSlug,
                description,
                logo_url: logoPath,
                owner_id: userId,
                location: location ? `POINT(${location.lng} ${location.lat})` : null,
                address: address,
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
        router.push(`/${profileSlug}/${storeSlug}`)
    }

    return (
        <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 pb-32">
            <AnimatedBackground />

            <div className="relative z-10 max-w-2xl mx-auto px-4 py-6 w-full">
                {/* Header with step indicator */}
                <header className="flex items-center justify-between mb-6 pb-4 border-b border-orange-200/50">
                    <button
                        onClick={() => {
                            if (step === 'account') setStep('store')
                            else if (step === 'success') router.push('/')
                            else router.back()
                        }}
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
                    <div className="w-10" /> {/* espaçador */}
                </header>

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
                                Endereço (Link)
                            </label>
                            <div className="flex items-center bg-white border-2 border-orange-200 rounded-xl overflow-hidden focus-within:border-orange-500 transition-all">
                                <span className="px-3 bg-orange-50 text-gray-600 border-r border-orange-200 text-xs font-bold py-3 whitespace-nowrap">
                                    iuser.com.br/
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
                                    Indisponível, adaptado
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

                        {/* Localização (idêntico ao CriarLoja original) */}
                        <div className="space-y-3">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                                <MapPinned className="w-3 h-3 text-orange-500" />
                                Localização
                            </label>

                            {!location && !editingAddress && (
                                <div className="space-y-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            navigator.geolocation.getCurrentPosition(
                                                (pos) => {
                                                    setLocation({
                                                        lat: pos.coords.latitude,
                                                        lng: pos.coords.longitude,
                                                    })
                                                    fetchAddressFromCoords(pos.coords.latitude, pos.coords.longitude)
                                                },
                                                () => toast.error('Erro ao obter localização')
                                            )
                                        }}
                                        className="w-full flex items-center justify-center gap-2 py-3 bg-orange-50 text-orange-700 border-2 border-orange-200 rounded-xl font-black uppercase text-[9px] tracking-wider hover:bg-orange-100 transition-all"
                                    >
                                        <MapPinned size={14} />
                                        Usar minha localização atual
                                    </button>

                                    <div className="relative">
                                        <input
                                            placeholder="Ou digite o endereço..."
                                            value={manualAddress}
                                            onChange={(e) => {
                                                setManualAddress(e.target.value)
                                                setEditingAddress(true)
                                            }}
                                            className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:border-orange-500 transition-all"
                                        />
                                        {suggestions.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-orange-200 rounded-xl overflow-hidden shadow-lg z-50">
                                                {suggestions.map((s, i) => (
                                                    <div
                                                        key={i}
                                                        onClick={() => selectSuggestion(s)}
                                                        className="p-3 hover:bg-orange-50 cursor-pointer border-b border-orange-100 last:border-0 text-sm text-gray-700"
                                                    >
                                                        {s.place_name}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {location && !editingAddress && (
                                <div className="p-4 bg-orange-50/50 rounded-xl border border-orange-200 space-y-2">
                                    <p className="text-sm font-medium text-gray-800">{address}</p>
                                    <button
                                        type="button"
                                        onClick={() => setEditingAddress(true)}
                                        className="flex items-center gap-2 text-orange-600 hover:text-orange-700 text-[9px] uppercase font-black tracking-wider"
                                    >
                                        <Edit3 size={12} />
                                        Editar Local
                                    </button>
                                </div>
                            )}

                            {editingAddress && (
                                <div className="relative space-y-3">
                                    <input
                                        placeholder="Digite um novo endereço"
                                        value={manualAddress}
                                        onChange={(e) => setManualAddress(e.target.value)}
                                        className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:border-orange-500 transition-all"
                                    />
                                    {suggestions.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-orange-200 rounded-xl overflow-hidden shadow-lg z-50">
                                            {suggestions.map((s, i) => (
                                                <div
                                                    key={i}
                                                    onClick={() => selectSuggestion(s)}
                                                    className="p-3 hover:bg-orange-50 cursor-pointer border-b border-orange-100 last:border-0 text-sm text-gray-700"
                                                >
                                                    {s.place_name}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditingAddress(false)
                                            setSuggestions([])
                                        }}
                                        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-[9px] uppercase font-black tracking-wider"
                                    >
                                        <X size={12} />
                                        Cancelar
                                    </button>
                                </div>
                            )}
                        </div>

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
                                SEU LINK DE PERFIL
                            </label>
                            <div className="flex items-center bg-white border-2 border-orange-200 rounded-xl overflow-hidden focus-within:border-orange-500 transition-all">
                                <span className="pl-4 pr-1 text-xs font-mono text-gray-400 bg-white py-3">
                                    iuser.com.br/
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
                                🔗 Seu link: /{profileSlug || '...'}
                            </p>
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
                            disabled={loading}
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
            </div>
        </div>
    )
}