'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ImageIcon, Package, Monitor, Briefcase, MapPin, Pencil } from 'lucide-react'

type ProductType = 'physical' | 'digital' | 'service'

export default function CriarProduto() {
    const router = useRouter()
    const params = useParams()
    const supabase = createClient()

    const storeSlug = Array.isArray(params.storeSlug)
        ? params.storeSlug[0]
        : params.storeSlug

    const fileInputRef = useRef<HTMLInputElement | null>(null)

    const [storeId, setStoreId] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [price, setPrice] = useState('')
    const [type, setType] = useState<ProductType>('physical')
    const [location, setLocation] = useState<{lat: number, lng: number} | null>(null)
    const [address, setAddress] = useState('')
    const [city, setCity] = useState('')

    const [imageFile, setImageFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<string | null>(null)

    // 🔥 buscar loja
    useEffect(() => {
        const fetchStore = async () => {
            if (!storeSlug) return

            const { data } = await supabase
                .from('stores')
                .select('id')
                .eq('storeSlug', storeSlug)
                .single()

            if (!data) {
                alert('Loja não encontrada')
                router.push('/')
                return
            }

            setStoreId(data.id)
        }

        fetchStore()
    }, [storeSlug])

    // preview imagem
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
                alert('Endereço não encontrado! Tente digitar com mais detalhes (ex: Rua, Número, Cidade).')
            }
        } catch (e) {
            console.error(e)
            alert('Erro na busca do endereço no MapBox.')
        }
    }

    const handleCreate = async () => {
        if (!name || !price || !storeId) {
            alert('Preencha os campos obrigatórios')
            return
        }

        setLoading(true)

        let imagePath: string | null = null

        if (imageFile) {
            const fileExt = imageFile.name.split('.').pop()
            const fileName = `${Date.now()}.${fileExt}`

            const { data, error } = await supabase.storage
                .from('product-images')
                .upload(fileName, imageFile)

            if (!error && data) {
                imagePath = data.path
            }
        }

        const slug = name
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)+/g, '')

        const locationString = location ? `POINT(${location.lng} ${location.lat})` : null;

        const { error } = await supabase.from('products').insert({
            name,
            slug,
            description,
            price: parseFloat(price.replace(',', '.')),
            type,
            image_url: imagePath,
            store_id: storeId,
            location: locationString,
            address: address || null,
            city: city || null
        })

        if (error) {
            console.error(error)
            alert('Erro ao criar produto')
            setLoading(false)
            return
        }

        router.push(`/${storeSlug}`)
    }

    const typeOptions = [
        { label: 'Físico', value: 'physical', icon: Package },
        { label: 'Digital', value: 'digital', icon: Monitor },
        { label: 'Serviço', value: 'service', icon: Briefcase }
    ]

    return (
        <div className="min-h-screen bg-black text-white p-4 md:p-8 flex justify-center pb-24">
            <div className="w-full max-w-lg mt-8">
                <h1 className="text-3xl font-extrabold mb-2 tracking-tight">
                    Novo Produto
                </h1>
                <p className="text-neutral-400 mb-8">
                    Adicione um novo item ao seu catálogo.
                </p>

                <div className="bg-neutral-900 border border-neutral-800 p-6 md:p-8 rounded-2xl shadow-2xl">

                    {/* Image Upload */}
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full h-48 mb-8 rounded-xl border-2 border-dashed border-neutral-700 bg-neutral-950 flex flex-col items-center justify-center cursor-pointer overflow-hidden transition hover:border-white/50 hover:bg-neutral-900 group"
                    >
                        {preview ? (
                            <img src={preview} className="w-full h-full object-cover" alt="Product preview" />
                        ) : (
                            <>
                                <ImageIcon className="text-4xl text-neutral-500 mb-3 group-hover:text-white transition" />
                                <span className="text-sm text-neutral-400 font-medium">Clique para selecionar imagem</span>
                            </>
                        )}
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

                    <div className="space-y-6">
                        {/* Tipo de Produto */}
                        <div>
                            <label className="block text-sm font-semibold text-neutral-300 mb-2 ml-1">Tipo de Produto</label>
                            <div className="grid grid-cols-3 gap-2">
                                {typeOptions.map(option => (
                                    <button
                                        key={option.value}
                                        onClick={() => setType(option.value as ProductType)}
                                        className={`flex flex-col items-center justify-center gap-1.5 py-4 rounded-xl border transition ${type === option.value
                                            ? 'bg-white/10 border-white text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]'
                                            : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-white'
                                            }`}
                                    >
                                        <option.icon className={`w-5 h-5 ${type === option.value ? 'text-white' : 'text-neutral-500'}`} />
                                        <span className="text-xs font-semibold">{option.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* NOME */}
                        <div>
                            <label className="block text-sm font-semibold text-neutral-300 mb-2 ml-1">Nome do Produto</label>
                            <input
                                placeholder="Ex: Curso de Culinária"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full p-3.5 bg-neutral-950 text-white rounded-xl border border-neutral-800 focus:border-white focus:ring-1 focus:ring-white outline-none transition placeholder:text-neutral-600"
                            />
                        </div>

                        {/* PREÇO */}
                        <div>
                            <label className="block text-sm font-semibold text-neutral-300 mb-2 ml-1">Preço</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 font-medium">R$</span>
                                <input
                                    placeholder="0,00"
                                    value={price}
                                    onChange={(e) => setPrice(e.target.value)}
                                    className="w-full p-3.5 pl-12 bg-neutral-950 text-white rounded-xl border border-neutral-800 focus:border-white focus:ring-1 focus:ring-white outline-none transition placeholder:text-neutral-600"
                                />
                            </div>
                        </div>

                        {/* DESCRIÇÃO */}
                        <div>
                            <label className="block text-sm font-semibold text-neutral-300 mb-2 ml-1">Descrição</label>
                            <textarea
                                placeholder="Detalhes do seu produto..."
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={4}
                                className="w-full p-3.5 bg-neutral-950 text-white rounded-xl border border-neutral-800 focus:border-white focus:ring-1 focus:ring-white outline-none transition placeholder:text-neutral-600 resize-none"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-neutral-300 mb-2 ml-1">Localização do Produto/Serviço</label>
                            {location ? (
                                <div className="p-3.5 bg-neutral-950 text-white rounded-xl border border-white/50 text-sm flex flex-col gap-2 relative">
                                    <span className="font-bold flex items-center gap-1"><MapPin className="w-4 h-4" /> Localização Capturada</span>
                                    {address ? (
                                        <p className="text-neutral-300 text-xs leading-relaxed">{address}</p>
                                    ) : (
                                        <span className="text-neutral-500 text-xs animate-pulse">Buscando endereço exato...</span>
                                    )}
                                    <div className="flex flex-col sm:flex-row gap-2 mt-2">
                                        <button 
                                            onClick={() => {
                                                const newAddress = prompt("Digite o novo endereço completo (Rua, Número, Bairro, Cidade):", address)
                                                if (newAddress) fetchCoordsFromAddress(newAddress)
                                            }} 
                                            className="text-white font-semibold text-xs hover:bg-neutral-800 flex-1 border border-white/20 py-2 rounded-lg transition flex justify-center items-center gap-1"
                                        >
                                            <Pencil className="w-3 h-3" /> Editar
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
                                    className="w-full p-3.5 bg-neutral-900 border border-neutral-800 hover:border-white text-neutral-400 hover:text-white rounded-xl transition flex items-center justify-center gap-2"
                                >
                                    <MapPin className="w-5 h-5" /> Capturar Onde Será Vendido/Realizado
                                </button>
                            )}
                            <p className="text-xs text-neutral-500 mt-2 ml-1">Onde as pessoas podem encontrar isso usando o mapa.</p>
                        </div>
                    </div>

                    {/* BOTÃO */}
                    <button
                        onClick={handleCreate}
                        disabled={loading}
                        className="w-full mt-10 bg-white hover:bg-neutral-200 active:bg-neutral-300 text-black py-4 rounded-xl font-bold text-lg transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:shadow-[0_0_25px_rgba(255,255,255,0.25)]"
                    >
                        {loading ? (
                            <span className="animate-pulse">Adicionando...</span>
                        ) : (
                            'Adicionar Produto'
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
