'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Camera, MapPinned, Edit3, X } from 'lucide-react'

export default function CriarLoja() {
    const router = useRouter()
    const supabase = createClient()

    const fileInputRef = useRef<HTMLInputElement | null>(null)

    const [loading, setLoading] = useState(false)
    const [loadingLocation, setLoadingLocation] = useState(false)
    const [slugStatus, setSlugStatus] = useState<'idle'|'checking'|'available'|'taken'>('idle')

    const [name, setName] = useState('')
    const [storeSlug, setStoreSlug] = useState('')
    const [description, setDescription] = useState('')

    const [location, setLocation] = useState<{ lat: number, lng: number } | null>(null)
    const [address, setAddress] = useState('')
    const [city, setCity] = useState('')

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
        
        // Só tenta gerar do nome se ainda não foi criado ou modificado muito
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
                // Sugere um novo slug em caso de colisão (exemplo: loja-123)
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
        if (!name || !storeSlug) return alert('Preencha os campos')

        setLoading(true)

        const { data: userData } = await supabase.auth.getUser()
        if (!userData?.user) {
            alert('Você precisa estar logado')
            setLoading(false)
            return
        }

        let logoPath: string | null = null

        if (imageFile) {
            const fileExt = imageFile.name.split('.').pop()
            const fileName = `${Date.now()}.${fileExt}`

            const { data } = await supabase.storage
                .from('store-logos')
                .upload(fileName, imageFile)

            if (data) logoPath = data.path
        }

        const { error } = await supabase.from('stores').insert({
            name,
            storeSlug,
            description,
            logo_url: logoPath,
            owner_id: userData.user.id,
            location: location ? `POINT(${location.lng} ${location.lat})` : null
        })

        if (error) {
            alert(error.message)
            setLoading(false)
            return
        }

        router.push(`/${storeSlug}`)
    }

    return (
        <div className="min-h-screen bg-black text-white p-4 flex justify-center pb-24">
            <div className="w-full max-w-lg mt-8">

                <h1 className="text-3xl font-extrabold mb-6">
                    Criar Nova Loja
                </h1>

                <div className="bg-neutral-900 p-6 rounded-2xl space-y-6">

                    {/* LOGO */}
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="w-28 h-28 mx-auto rounded-full border-2 border-dashed border-neutral-700 hover:border-white flex items-center justify-center cursor-pointer overflow-hidden transition group"
                    >
                        {preview ? (
                            <img src={preview} className="w-full h-full object-cover" />
                        ) : (
                            <Camera className="text-neutral-500 group-hover:text-white transition" />
                        )}
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={(e) =>
                            e.target.files && setImageFile(e.target.files[0])
                        }
                    />

                    {/* NOME */}
                    <input
                        placeholder="Nome da loja"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full p-3.5 bg-neutral-950 rounded-xl border border-neutral-800 focus:border-white focus:ring-1 focus:ring-white outline-none transition"
                    />

                    {/* SLUG */}
                    <div>
                        <div className="flex bg-neutral-950 rounded-xl border border-neutral-800 focus-within:border-white focus-within:ring-1 focus-within:ring-white overflow-hidden transition">
                            <span className="flex items-center px-4 bg-neutral-900 text-neutral-500 border-r border-neutral-800 text-sm whitespace-nowrap">
                                iuser.com.br/
                            </span>

                            <input
                                placeholder="minha-loja"
                                value={storeSlug}
                                onChange={(e) =>
                                    setStoreSlug(
                                        e.target.value
                                            .toLowerCase()
                                            .replace(/[^a-z0-9-]/g, '')
                                    )
                                }
                                className="w-full p-3.5 bg-transparent text-white outline-none"
                            />
                        </div>
                        {storeSlug && slugStatus === 'checking' && <p className="text-xs text-neutral-500 mt-2 ml-1 animate-pulse">Verificando disponibilidade...</p>}
                        {storeSlug && slugStatus === 'available' && <p className="text-xs text-green-500 mt-2 ml-1">✓ Endereço disponível!</p>}
                        {storeSlug && slugStatus === 'taken' && <p className="text-xs text-red-500 mt-2 ml-1">✗ Endereço indisponível, gerando alternativa...</p>}
                    </div>

                    {/* DESCRIÇÃO */}
                    <textarea
                        placeholder="Descrição"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full p-3.5 bg-neutral-950 rounded-xl border border-neutral-800 focus:border-white focus:ring-1 focus:ring-white outline-none transition"
                    />

                    {/* LOCALIZAÇÃO */}
                    <div className="space-y-3">

                        {!location && !editingAddress && (
                            <>
                                <button
                                    disabled={loadingLocation}
                                    onClick={() => {
                                        setLoadingLocation(true)

                                        navigator.geolocation.getCurrentPosition(
                                            (pos) => {
                                                setLocation({
                                                    lat: pos.coords.latitude,
                                                    lng: pos.coords.longitude
                                                })

                                                fetchAddressFromCoords(
                                                    pos.coords.latitude,
                                                    pos.coords.longitude
                                                )

                                                setLoadingLocation(false)
                                            },
                                            () => {
                                                alert('Erro ao obter localização')
                                                setLoadingLocation(false)
                                            }
                                        )
                                    }}
                                    className="w-full flex items-center justify-center gap-2 p-3.5 bg-neutral-900 border border-neutral-800 hover:border-white hover:text-white rounded-xl transition text-neutral-400"
                                >
                                    <MapPinned size={18} />
                                    {loadingLocation ? 'Procurando localização...' : 'Usar minha localização'}
                                </button>

                                <div className="relative">
                                    <input
                                        placeholder="Digite um endereço"
                                        value={manualAddress}
                                        onChange={(e) => {
                                            setManualAddress(e.target.value)
                                            setEditingAddress(true)
                                        }}
                                        className="w-full p-3.5 bg-neutral-950 rounded-xl border border-neutral-800 focus:border-white focus:ring-1 focus:ring-white outline-none transition"
                                    />

                                    {suggestions.length > 0 && (
                                        <div className="absolute w-full bg-neutral-900 border mt-1 rounded-xl z-50">
                                            {suggestions.map((s, i) => (
                                                <div
                                                    key={i}
                                                    onClick={() => selectSuggestion(s)}
                                                    className="p-3 hover:bg-neutral-800 cursor-pointer"
                                                >
                                                    {s.place_name}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {location && !editingAddress && (
                            <div className="p-4 border border-white/50 bg-neutral-950 rounded-xl space-y-3 shadow-[0_0_15px_rgba(255,255,255,0.05)]">
                                <p className="text-xs text-neutral-300">{address}</p>

                                <button
                                    onClick={() => setEditingAddress(true)}
                                    className="flex items-center gap-2 text-white hover:underline text-sm font-semibold"
                                >
                                    <Edit3 size={16} />
                                    Editar localização
                                </button>
                            </div>
                        )}

                        {editingAddress && (
                            <div className="relative space-y-2">

                                <input
                                    placeholder="Digite um novo endereço"
                                    value={manualAddress}
                                    onChange={(e) => {
                                        setManualAddress(e.target.value)
                                    }}
                                    className="w-full p-3.5 bg-neutral-950 rounded-xl border border-neutral-800 focus:border-white focus:ring-1 focus:ring-white outline-none transition"
                                />

                                {suggestions.length > 0 && (
                                    <div className="absolute w-full bg-neutral-900 border mt-1 rounded-xl z-50">
                                        {suggestions.map((s, i) => (
                                            <div
                                                key={i}
                                                onClick={() => selectSuggestion(s)}
                                                className="p-3 hover:bg-neutral-800 cursor-pointer"
                                            >
                                                {s.place_name}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <button
                                    onClick={() => setEditingAddress(false)}
                                    className="text-sm text-neutral-400 flex items-center gap-2"
                                >
                                    <X size={16} />
                                    Cancelar edição
                                </button>
                            </div>
                        )}

                    </div>

                    {/* BOTÃO */}
                    <button
                        onClick={handleCreate}
                        disabled={loading}
                        className="w-full mt-4 bg-white hover:bg-neutral-200 active:bg-neutral-300 text-black py-4 rounded-xl font-bold text-lg transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:shadow-[0_0_25px_rgba(255,255,255,0.25)]"
                    >
                        {loading ? 'Criando...' : 'Criar Loja'}
                    </button>

                </div>
            </div>
        </div>
    )
}
