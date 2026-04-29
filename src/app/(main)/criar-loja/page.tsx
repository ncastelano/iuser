'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Camera, MapPinned, Edit3, X, ArrowLeft, Store, Sparkles, Zap, CheckCircle2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import AnimatedBackground from '@/components/AnimatedBackground'

export default function CriarLoja() {
    const router = useRouter()
    const supabase = createClient()

    const fileInputRef = useRef<HTMLInputElement | null>(null)

    const [loading, setLoading] = useState(false)
    const [loadingLocation, setLoadingLocation] = useState(false)
    const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')

    const [name, setName] = useState('')
    const [storeSlug, setStoreSlug] = useState('')
    const [description, setDescription] = useState('')

    const [location, setLocation] = useState<{ lat: number, lng: number } | null>(null)
    const [address, setAddress] = useState('')

    const [manualAddress, setManualAddress] = useState('')
    const [editingAddress, setEditingAddress] = useState(false)

    const [suggestions, setSuggestions] = useState<any[]>([])

    const [imageFile, setImageFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<string | null>(null)

    // SLUG AUTOMÁTICO
    useEffect(() => {
        if (!name) return setStoreSlug('')
        const slug = name
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)+/g, '')

        setStoreSlug(slug)
    }, [name])

    // CHECAR DISPONIBILIDADE DO SLUG
    useEffect(() => {
        if (!storeSlug) {
            setSlugStatus('idle')
            return
        }

        const check = async () => {
            setSlugStatus('checking')
            const { data } = await supabase.from('stores').select('id').eq('storeSlug', storeSlug).limit(1).maybeSingle()
            if (data) {
                setSlugStatus('taken')
                setStoreSlug(`${storeSlug}-${Math.floor(Math.random() * 9999)}`)
            } else {
                setSlugStatus('available')
            }
        }

        const timer = setTimeout(check, 600)
        return () => clearTimeout(timer)
    }, [storeSlug, supabase])

    // IMAGE PREVIEW
    useEffect(() => {
        if (!imageFile) return
        const url = URL.createObjectURL(imageFile)
        setPreview(url)
        return () => URL.revokeObjectURL(url)
    }, [imageFile])

    // AUTOCOMPLETE
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

    const handleCreate = async () => {
        if (!name || !storeSlug) return toast.error('Preencha os campos')

        setLoading(true)

        const { data: userData } = await supabase.auth.getUser()
        if (!userData?.user) {
            toast.error('Você precisa estar logado')
            setLoading(false)
            return
        }

        let logoPath: string | null = null

        if (imageFile) {
            const fileExt = imageFile.name.split('.').pop()
            const fileName = `${Date.now()}.${fileExt}`

            const { data, error } = await supabase.storage
                .from('store-logos')
                .upload(fileName, imageFile)

            if (error) {
                console.error(error)
            }

            if (data) logoPath = data.path
        }

        const { error } = await supabase.from('stores').insert({
            name,
            storeSlug,
            description,
            logo_url: logoPath,
            owner_id: userData.user.id,
            location: location ? `POINT(${location.lng} ${location.lat})` : null,
            address: address,
        })

        if (error) {
            toast.error(error.message)
            setLoading(false)
            return
        }

        // Buscar o profileSlug do usuário
        const { data: profileData } = await supabase
            .from('profiles')
            .select('profileSlug')
            .eq('id', userData.user.id)
            .single()

        const profileSlug = profileData?.profileSlug || 'perfil'

        setLoading(false)

        // Redirecionar para a URL com profileSlug e storeSlug
        router.push(`/${profileSlug}/${storeSlug}`)
    }

    return (
        <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 pb-32">
            <AnimatedBackground />

            <div className="relative z-10 max-w-2xl mx-auto px-4 py-6 w-full">
                {/* Header */}
                <header className="flex items-center gap-3 mb-6 pb-4 border-b border-orange-200/50">
                    <button
                        onClick={() => router.back()}
                        className="w-10 h-10 flex items-center justify-center bg-white/90 border-2 border-orange-200 rounded-xl hover:bg-gradient-to-r hover:from-orange-500 hover:to-red-500 hover:text-white transition-all"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent tracking-tighter">
                            Criar Loja
                        </h1>
                        <p className="text-[8px] font-black uppercase tracking-wider text-gray-500 mt-0.5">
                            Comece seu negócio digital
                        </p>
                    </div>
                </header>

                {/* Form Card */}
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
                            className="hidden"
                            onChange={(e) => e.target.files && setImageFile(e.target.files[0])}
                        />
                    </div>

                    {/* NOME */}
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                            <Store className="w-3 h-3 text-orange-500" />
                            Nome da Loja
                        </label>
                        <input
                            placeholder="Minha Super Loja"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:border-orange-500 transition-all"
                        />
                    </div>

                    {/* SLUG */}
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
                                Indisponível, adaptado
                            </div>
                        )}
                    </div>

                    {/* DESCRIÇÃO */}
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

                    {/* LOCALIZAÇÃO */}
                    <div className="space-y-3">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                            <MapPinned className="w-3 h-3 text-orange-500" />
                            Localização
                        </label>

                        {!location && !editingAddress && (
                            <div className="space-y-3">
                                <button
                                    disabled={loadingLocation}
                                    onClick={() => {
                                        setLoadingLocation(true)
                                        navigator.geolocation.getCurrentPosition(
                                            (pos) => {
                                                setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
                                                fetchAddressFromCoords(pos.coords.latitude, pos.coords.longitude)
                                                setLoadingLocation(false)
                                            },
                                            () => {
                                                toast.error('Erro ao obter localização')
                                                setLoadingLocation(false)
                                            }
                                        )
                                    }}
                                    className="w-full flex items-center justify-center gap-2 py-3 bg-orange-50 text-orange-700 border-2 border-orange-200 rounded-xl font-black uppercase text-[9px] tracking-wider hover:bg-orange-100 transition-all"
                                >
                                    <MapPinned size={14} />
                                    {loadingLocation ? 'Buscando...' : 'Usar minha localização atual'}
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

                    {/* BOTÃO CRIAR */}
                    <button
                        onClick={handleCreate}
                        disabled={loading}
                        className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-black uppercase text-xs tracking-wider hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {loading ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <Sparkles className="w-4 h-4" />
                                Criar Loja
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}