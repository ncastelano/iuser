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
        setStoreSlug(slug)
    }, [name])

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
                        className="w-28 h-28 mx-auto rounded-full border-2 border-dashed border-neutral-700 flex items-center justify-center cursor-pointer overflow-hidden"
                    >
                        {preview ? (
                            <img src={preview} className="w-full h-full object-cover" />
                        ) : (
                            <Camera />
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
                        className="w-full p-3 bg-neutral-950 rounded-xl"
                    />

                    {/* SLUG */}
                    <div className="flex bg-neutral-950 rounded-xl border border-neutral-800 overflow-hidden">
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
                            className="w-full p-3 bg-transparent text-white outline-none"
                        />
                    </div>

                    {/* DESCRIÇÃO */}
                    <textarea
                        placeholder="Descrição"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full p-3 bg-neutral-950 rounded-xl"
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
                                    className="w-full flex items-center justify-center gap-2 p-3 bg-neutral-900 border border-neutral-800 rounded-xl"
                                >
                                    <MapPinned size={18} />
                                    {loadingLocation ? 'Procurando...' : 'Usar minha localização'}
                                </button>

                                <div className="relative">
                                    <input
                                        placeholder="Digite um endereço"
                                        value={manualAddress}
                                        onChange={(e) => {
                                            setManualAddress(e.target.value)
                                            setEditingAddress(true)
                                        }}
                                        className="w-full p-3 bg-neutral-950 rounded-xl"
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
                            <div className="p-3 border border-orange-500 rounded-xl space-y-2">
                                <p className="text-xs">{address}</p>

                                <button
                                    onClick={() => setEditingAddress(true)}
                                    className="flex items-center gap-2 text-orange-400 text-sm"
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
                                    className="w-full p-3 bg-neutral-950 rounded-xl"
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
                        className="w-full bg-orange-500 py-3 rounded-xl font-bold"
                    >
                        {loading ? 'Criando...' : 'Criar Loja'}
                    </button>

                </div>
            </div>
        </div>
    )
}
