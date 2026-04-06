'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Camera } from 'lucide-react'

export default function CriarLoja() {
    const router = useRouter()
    const supabase = createClient()

    const fileInputRef = useRef<HTMLInputElement | null>(null)

    const [loading, setLoading] = useState(false)
    const [name, setName] = useState('')
    const [storeSlug, setStoreSlug] = useState('')
    const [description, setDescription] = useState('')
    const [location, setLocation] = useState<{lat: number, lng: number} | null>(null)
    const [address, setAddress] = useState('')
    const [city, setCity] = useState('')

    const [imageFile, setImageFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<string | null>(null)

    // auto-generate slug from name
    useEffect(() => {
        if (!name) {
            setStoreSlug('')
            return
        }
        const generatedSlug = name
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)+/g, '')
        setStoreSlug(generatedSlug)
    }, [name])

    useEffect(() => {
        if (!imageFile) return
        const url = URL.createObjectURL(imageFile)
        setPreview(url)
        return () => URL.revokeObjectURL(url)
    }, [imageFile])

    const fetchAddressFromCoords = async (lat: number, lng: number) => {
        try {
            const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
            const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&types=address,poi,place`)
            const data = await res.json()
            if (data && data.features && data.features.length > 0) {
                const feature = data.features[0]
                setAddress(feature.place_name)
                const cityContext = feature.context?.find((c: any) => c.id.startsWith('place'))
                setCity(cityContext ? cityContext.text : '')
            }
        } catch (e) {
            console.error(e)
        }
    }

    const fetchCoordsFromAddress = async (query: string) => {
        try {
            const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
            const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=1&country=BR`)
            const data = await res.json()
            if (data && data.features && data.features.length > 0) {
                const feature = data.features[0]
                const [lon, lat] = feature.center
                setLocation({ lat, lng: lon })
                setAddress(feature.place_name)
                
                const cityContext = feature.context?.find((c: any) => c.id.startsWith('place'))
                setCity(cityContext ? cityContext.text : '')
            } else {
                alert('Endereço não encontrado! Tente digitar um formato mais completo (ex: Rua, Número, Cidade, Estado).')
            }
        } catch (e) {
            console.error(e)
            alert('Erro na busca do endereço no MapBox.')
        }
    }

    const handleCreate = async () => {
        if (!name || !storeSlug) {
            alert('Preencha os campos obrigatórios')
            return
        }

        setLoading(true)

        const { data: userData, error: userError } = await supabase.auth.getUser()
        if (userError || !userData.user) {
            alert('Você precisa estar logado para criar uma loja')
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

            if (!error && data) {
                logoPath = data.path
            }
        }

        const locationString = location ? `POINT(${location.lng} ${location.lat})` : null;

        const { error } = await supabase.from('stores').insert({
            name,
            storeSlug,
            description,
            logo_url: logoPath,
            owner_id: userData.user.id,
            location: locationString,
            address: address || null,
            city: city || null
        })

        if (error) {
            console.error(error)
            if (error.code === '23505') {
                alert('Este slug já está em uso. Escolha outro nome da loja ou altere a URL.')
            } else {
                alert('Erro ao criar loja')
            }
            setLoading(false)
            return
        }

        router.push(`/${storeSlug}`)
    }

    return (
        <div className="min-h-screen bg-black text-white p-4 md:p-8 flex justify-center pb-24">
            <div className="w-full max-w-lg mt-8">
                <h1 className="text-3xl font-extrabold mb-2 tracking-tight">
                    Criar Nova Loja
                </h1>
                <p className="text-neutral-400 mb-8">
                    Configure os detalhes da sua loja para começar a vender.
                </p>

                <div className="bg-neutral-900 border border-neutral-800 p-6 md:p-8 rounded-2xl shadow-2xl">
                    
                    {/* Logo Upload */}
                    <div className="mb-8 flex flex-col items-center">
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="w-32 h-32 rounded-full border-2 border-dashed border-neutral-700 bg-neutral-950 flex flex-col items-center justify-center cursor-pointer overflow-hidden transition hover:border-orange-500 hover:bg-neutral-900 group"
                        >
                            {preview ? (
                                <img src={preview} className="w-full h-full object-cover" alt="Logo preview" />
                            ) : (
                                <>
                                    <Camera className="text-3xl text-neutral-500 mb-2 group-hover:text-orange-500 transition" />
                                    <span className="text-xs text-neutral-500 font-medium tracking-wide">Logo</span>
                                </>
                            )}
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) =>
                                e.target.files && setImageFile(e.target.files[0])
                            }
                        />
                    </div>

                    {/* Form Fields */}
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-semibold text-neutral-300 mb-2 ml-1">Nome da Loja</label>
                            <input
                                placeholder="Ex: Minha Loja Fantástica"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full p-3.5 bg-neutral-950 text-white rounded-xl border border-neutral-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition placeholder:text-neutral-600"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-neutral-300 mb-2 ml-1">URL da Loja</label>
                            <div className="flex bg-neutral-950 rounded-xl border border-neutral-800 overflow-hidden focus-within:border-orange-500 focus-within:ring-1 focus-within:ring-orange-500 transition">
                                <span className="flex items-center px-4 bg-neutral-900 text-neutral-500 border-r border-neutral-800 text-sm whitespace-nowrap">
                                    myapp.com/
                                </span>
                                <input
                                    placeholder="minha-loja"
                                    value={storeSlug}
                                    onChange={(e) => setStoreSlug(e.target.value)}
                                    className="w-full p-3.5 bg-transparent text-white outline-none placeholder:text-neutral-600"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-neutral-300 mb-2 ml-1">Descrição</label>
                            <textarea
                                placeholder="O que sua loja vende?"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={3}
                                className="w-full p-3.5 bg-neutral-950 text-white rounded-xl border border-neutral-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition placeholder:text-neutral-600 resize-none"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-neutral-300 mb-2 ml-1">Localização no Mapa</label>
                            {location ? (
                                <div className="p-3.5 bg-neutral-950 text-orange-500 rounded-xl border border-orange-500/50 text-sm flex flex-col gap-2 relative">
                                    <span className="font-bold">📍 Localização Capturada</span>
                                    {address ? (
                                        <p className="text-white text-xs leading-relaxed">{address}</p>
                                    ) : (
                                        <span className="text-neutral-500 text-xs animate-pulse">Buscando endereço exato...</span>
                                    )}
                                    <div className="flex flex-col sm:flex-row gap-2 mt-2">
                                        <button 
                                            onClick={() => {
                                                const newAddress = prompt("Digite o novo endereço completo (Rua, Número, Bairro, Cidade):", address)
                                                if (newAddress) fetchCoordsFromAddress(newAddress)
                                            }} 
                                            className="text-orange-500 font-semibold text-xs hover:text-white flex-1 bg-orange-500/10 py-2 rounded-lg transition"
                                        >
                                            ✏️ Editar Endereço manualmente
                                        </button>
                                        <button 
                                            onClick={() => {
                                                setLocation(null)
                                                setAddress('')
                                                setCity('')
                                            }} 
                                            className="text-red-400 font-semibold text-xs hover:text-white bg-red-400/10 px-4 py-2 rounded-lg transition"
                                        >
                                            Remover
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => {
                                        if (navigator.geolocation) {
                                            navigator.geolocation.getCurrentPosition(
                                                (pos) => {
                                                    setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
                                                    fetchAddressFromCoords(pos.coords.latitude, pos.coords.longitude)
                                                },
                                                (err) => alert('Permissão negada ou erro ao buscar localização')
                                            );
                                        } else {
                                            alert('Geolocalização não suportada pelo navegador.');
                                        }
                                    }}
                                    className="w-full p-3.5 bg-neutral-900 border border-neutral-800 hover:border-orange-500 text-neutral-400 hover:text-orange-500 rounded-xl transition flex items-center justify-center gap-2"
                                >
                                    📍 Capturar Minha Localização Atual
                                </button>
                            )}
                            <p className="text-xs text-neutral-500 mt-2 ml-1">Essencial para aparecer no mapa aos clientes próximos.</p>
                        </div>
                    </div>

                    {/* Submit Button */}
                    <button
                        onClick={handleCreate}
                        disabled={loading}
                        className="w-full mt-10 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-black py-4 rounded-xl font-bold text-lg transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(249,115,22,0.15)] hover:shadow-[0_0_25px_rgba(249,115,22,0.25)]"
                    >
                        {loading ? (
                            <span className="animate-pulse">Criando...</span>
                        ) : (
                            'Criar Minha Loja'
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
