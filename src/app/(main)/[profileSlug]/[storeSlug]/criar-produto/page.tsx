'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ImageIcon, Package, Monitor, Briefcase, MapPin, Pencil, ArrowLeft, Plus } from 'lucide-react'
import { toast } from 'sonner'

type ProductType = 'physical' | 'digital' | 'service'

export default function CriarProduto() {
    const router = useRouter()
    const params = useParams()
    const supabase = createClient()

    const storeSlug = Array.isArray(params.storeSlug)
        ? params.storeSlug[0]
        : params.storeSlug

    const profileSlug = Array.isArray(params.profileSlug)
        ? params.profileSlug[0]
        : params.profileSlug

    const fileInputRef = useRef<HTMLInputElement | null>(null)

    const [storeId, setStoreId] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [loadingLocation, setLoadingLocation] = useState(false)

    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [price, setPrice] = useState('')
    const [type, setType] = useState<ProductType>('physical')
    const [location, setLocation] = useState<{ lat: number, lng: number } | null>(null)
    const [address, setAddress] = useState('')
    const [city, setCity] = useState('')
    const [category, setCategory] = useState('')

    const [imageFile, setImageFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<string | null>(null)
    const [existingCategories, setExistingCategories] = useState<string[]>([])

    useEffect(() => {
        const fetchStore = async () => {
            if (!storeSlug) return
            const { data } = await supabase
                .from('stores')
                .select('id')
                .ilike('storeSlug', storeSlug || '')
                .maybeSingle()

            if (!data) {
                toast.error('Loja não encontrada')
                router.push('/')
                return
            }
            setStoreId(data.id)
        }
        fetchStore()
    }, [storeSlug])

    useEffect(() => {
        const fetchCategories = async () => {
            if (!storeId) return
            const { data } = await supabase
                .from('products')
                .select('category')
                .eq('store_id', storeId)

            if (data) {
                const cats = Array.from(new Set(data.map(p => p.category).filter(Boolean))) as string[]
                setExistingCategories(cats)
            }
        }
        fetchCategories()
    }, [storeId])

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
                const cityComponent = feature.context?.find((c: any) => c.id.includes('place'))
                if (cityComponent) setCity(cityComponent.text)
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
                const cityComponent = feature.context?.find((c: any) => c.id.includes('place'))
                if (cityComponent) setCity(cityComponent.text)
            } else {
                toast.error('Endereço não encontrado!')
            }
        } catch (e) {
            console.error(e)
            toast.error('Erro na busca do endereço.')
        }
    }

    const handleCreate = async () => {
        if (!name || !price || !storeId) {
            toast.error('Preencha os campos obrigatórios')
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

            if (!error && data) imagePath = data.path
        }

        let slug = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')

        let isUnique = false
        while (!isUnique) {
            const { data } = await supabase.from('products').select('id').eq('slug', slug).eq('store_id', storeId).limit(1).maybeSingle()
            if (data) slug = slug + '-' + Math.floor(Math.random() * 9999).toString()
            else isUnique = true
        }

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
            city: city || null,
            category: category || null
        })

        if (error) {
            console.error(error)
            toast.error('Erro ao criar produto')
            setLoading(false)
            return
        }

        toast.success('Produto criado com sucesso!')
        router.push(`/${profileSlug}/${storeSlug}`)
    }

    const typeOptions = [
        { label: 'Produto', value: 'physical', icon: Package },
        { label: 'Digital', value: 'digital', icon: Monitor },
        { label: 'Serviço', value: 'service', icon: Briefcase },
    ]

    return (
        <div className="min-h-screen bg-background text-foreground p-4 md:p-8 font-sans selection:bg-primary selection:text-primary-foreground">
            <div className="max-w-2xl mx-auto space-y-10 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                
                {/* Header */}
                <div className="flex items-center gap-6 border-b border-border pb-8">
                    <button
                        onClick={() => router.back()}
                        className="w-12 h-12 flex items-center justify-center bg-secondary/50 border border-border hover:bg-secondary transition-all active:scale-95 rounded-none"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>

                    <div>
                        <h1 className="text-4xl font-black italic uppercase tracking-tighter leading-none">
                            Novo Produto<span className="text-primary">.</span>
                        </h1>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground mt-1">
                            Adicione um novo item ao seu catálogo
                        </p>
                    </div>
                </div>

                {/* Card */}
                <div className="bg-card/40 backdrop-blur-xl p-8 border border-border shadow-2xl space-y-8 rounded-none">
                    
                    {/* Image Upload */}
                    <div className="space-y-4">
                        <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                            Imagem do Produto
                        </label>
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full h-64 border border-border bg-secondary/30 flex flex-col items-center justify-center cursor-pointer overflow-hidden transition hover:bg-secondary/50 group relative rounded-none"
                        >
                            {preview ? (
                                <>
                                    <img src={preview} className="w-full h-full object-cover" alt="Product preview" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <Pencil className="w-8 h-8 text-white" />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="w-16 h-16 bg-background border border-border flex items-center justify-center mb-4 group-hover:scale-110 transition-transform rounded-none">
                                        <ImageIcon className="w-8 h-8 text-muted-foreground" />
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">
                                        Clique para selecionar imagem
                                    </span>
                                </>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => e.target.files && setImageFile(e.target.files[0])}
                            />
                        </div>
                    </div>

                    <div className="space-y-8">
                        {/* Tipo de Produto */}
                        <div className="space-y-4">
                            <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                                Tipo de Produto
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                {typeOptions.map(option => (
                                    <button
                                        key={option.value}
                                        onClick={() => setType(option.value as ProductType)}
                                        className={`flex flex-col items-center justify-center gap-2 py-5 border transition-all rounded-none ${type === option.value
                                            ? 'bg-foreground text-background border-foreground shadow-xl'
                                            : 'bg-secondary/30 border-border text-muted-foreground hover:bg-secondary/50'
                                            }`}
                                    >
                                        <option.icon className="w-5 h-5" />
                                        <span className="text-[9px] font-black uppercase tracking-widest">{option.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* NOME */}
                        <div className="space-y-4">
                            <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                                Nome do Produto
                            </label>
                            <input
                                placeholder="EX: PASTEL DE QUEIJO"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-secondary/30 border border-border px-6 py-4 text-foreground font-bold outline-none focus:border-primary transition-all placeholder:text-muted-foreground/30 uppercase rounded-none"
                            />
                        </div>

                        {/* PREÇO */}
                        <div className="space-y-4">
                            <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                                Preço de Venda
                            </label>
                            <div className="relative">
                                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-muted-foreground font-black text-xs">R$</span>
                                <input
                                    placeholder="0,00"
                                    value={price}
                                    onChange={(e) => setPrice(e.target.value)}
                                    className="w-full bg-secondary/30 border border-border pl-14 pr-6 py-4 text-foreground font-black outline-none focus:border-primary transition-all placeholder:text-muted-foreground/30 text-xl italic rounded-none"
                                />
                            </div>
                        </div>

                        {/* DESCRIÇÃO */}
                        <div className="space-y-4">
                            <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                                Detalhes / Descrição
                            </label>
                            <textarea
                                placeholder="DESCREVA O SEU PRODUTO OU SERVIÇO AQUI..."
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={4}
                                className="w-full bg-secondary/30 border border-border px-6 py-4 text-foreground font-medium outline-none focus:border-primary transition-all placeholder:text-muted-foreground/30 resize-none leading-relaxed rounded-none"
                            />
                        </div>

                        {/* CATEGORIA */}
                        <div className="space-y-4">
                            <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                                Categoria
                            </label>
                            <input
                                placeholder="EX: BEBIDAS, SOBREMESAS..."
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="w-full bg-secondary/30 border border-border px-6 py-4 text-foreground font-bold outline-none focus:border-primary transition-all placeholder:text-muted-foreground/30 uppercase rounded-none"
                            />
                            {existingCategories.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {existingCategories.map(cat => (
                                        <button
                                            key={cat}
                                            onClick={() => setCategory(cat)}
                                            className={`px-3 py-1.5 border font-black text-[8px] uppercase tracking-widest transition-all rounded-none ${category === cat ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary/20 border-border text-muted-foreground hover:bg-secondary/50'}`}
                                        >
                                            {cat}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* LOCALIZAÇÃO */}
                        <div className="space-y-4 border-t border-border/50 pt-8">
                            <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                                Localização (Opcional)
                            </label>
                            {location ? (
                                <div className="bg-primary/5 border border-primary/20 p-6 space-y-4 rounded-none">
                                    <div className="flex items-center gap-3">
                                        <MapPin className="w-5 h-5 text-primary" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-primary">Localização Definida</span>
                                    </div>
                                    {address && (
                                        <p className="text-xs text-muted-foreground font-medium leading-relaxed">{address}</p>
                                    )}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => {
                                                const newAddress = prompt("Digite o endereço completo:", address)
                                                if (newAddress) fetchCoordsFromAddress(newAddress)
                                            }}
                                            className="px-4 py-2 bg-background border border-border text-[9px] font-black uppercase tracking-widest hover:bg-secondary transition-all rounded-none"
                                        >
                                            Editar
                                        </button>
                                        <button
                                            onClick={() => { setLocation(null); setAddress(''); setCity(''); }}
                                            className="px-4 py-2 bg-destructive/10 text-destructive border border-destructive/20 text-[9px] font-black uppercase tracking-widest hover:bg-destructive/20 transition-all rounded-none"
                                        >
                                            Remover
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    disabled={loadingLocation}
                                    onClick={() => {
                                        setLoadingLocation(true)
                                        if (navigator.geolocation) {
                                            navigator.geolocation.getCurrentPosition(
                                                (pos) => {
                                                    setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
                                                    fetchAddressFromCoords(pos.coords.latitude, pos.coords.longitude)
                                                    setLoadingLocation(false)
                                                },
                                                (err) => {
                                                    toast.error('Erro ao buscar localização')
                                                    setLoadingLocation(false)
                                                }
                                            );
                                        } else {
                                            toast.error('Geolocalização não suportada')
                                            setLoadingLocation(false)
                                        }
                                    }}
                                    className="w-full bg-secondary/30 border border-border border-dashed py-6 flex flex-col items-center justify-center gap-2 hover:bg-secondary/50 transition-all group rounded-none"
                                >
                                    <MapPin className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-foreground">
                                        {loadingLocation ? 'Buscando...' : 'Capturar Localização do Produto'}
                                    </span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Submit */}
                    <button
                        onClick={handleCreate}
                        disabled={loading}
                        className="w-full py-6 bg-foreground text-background font-black uppercase text-xs tracking-[0.3em] flex items-center justify-center gap-3 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 shadow-2xl rounded-none"
                    >
                        {loading ? (
                            'ADICIONANDO...'
                        ) : (
                            <>
                                <Plus className="w-5 h-5" />
                                Criar Produto
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}