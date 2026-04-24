'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Camera, MapPinned, Edit3, X, ArrowLeft } from 'lucide-react'

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
            alert(error.message)
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
        <div className="min-h-screen bg-background text-foreground p-4 md:p-8 font-sans selection:bg-primary selection:text-primary-foreground pb-40">
            <div className="max-w-2xl mx-auto space-y-10 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* Header */}
                <div className="flex items-center gap-6 border-b border-border pb-8">
                    <button
                        onClick={() => router.back()}
                        className="w-12 h-12 flex items-center justify-center bg-secondary/50 border border-border rounded-2xl hover:bg-secondary transition-all active:scale-95 flex-shrink-0"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <div>
                        <h1 className="text-4xl font-black italic uppercase tracking-tighter leading-none">
                            Criar Loja<span className="text-primary">.</span>
                        </h1>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground mt-1">
                            Comece seu negócio digital
                        </p>
                    </div>
                </div>

                <div className="bg-card/40 backdrop-blur-xl p-8 rounded-[40px] border border-border shadow-2xl space-y-8">
                    {/* LOGO */}
                    <div className="space-y-4">
                        <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground text-center">
                            Logo da Loja
                        </label>
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="w-32 h-32 mx-auto rounded-[32px] border border-dashed border-primary/50 bg-primary/5 hover:bg-primary/10 flex items-center justify-center cursor-pointer overflow-hidden transition-all group"
                        >
                            {preview ? (
                                <img src={preview} className="w-full h-full object-cover" />
                            ) : (
                                <Camera className="text-primary group-hover:scale-110 transition-transform" size={32} />
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
                        <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                            Nome da Loja
                        </label>
                        <input
                            placeholder="Minha Super Loja"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-secondary/30 border border-border px-6 py-4 rounded-2xl text-foreground font-bold outline-none focus:border-primary transition-all placeholder:text-muted-foreground/30"
                        />
                    </div>

                    {/* SLUG */}
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                            Endereço (Link)
                        </label>
                        <div className="flex bg-secondary/30 border border-border rounded-2xl focus-within:border-primary overflow-hidden transition-all">
                            <span className="flex items-center px-4 bg-muted text-muted-foreground border-r border-border text-xs font-bold whitespace-nowrap">
                                iuser.com.br/
                            </span>
                            <input
                                placeholder="minha-loja"
                                value={storeSlug}
                                onChange={(e) => setStoreSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                className="w-full p-4 bg-transparent text-foreground font-bold outline-none"
                            />
                        </div>
                        {storeSlug && slugStatus === 'checking' && <p className="text-[10px] font-bold text-muted-foreground mt-2 animate-pulse uppercase tracking-wider">Verificando...</p>}
                        {storeSlug && slugStatus === 'available' && <p className="text-[10px] font-bold text-green-500 mt-2 uppercase tracking-wider">✓ Link Disponível</p>}
                        {storeSlug && slugStatus === 'taken' && <p className="text-[10px] font-bold text-destructive mt-2 uppercase tracking-wider">✗ Indisponível, adaptado</p>}
                    </div>

                    {/* DESCRIÇÃO */}
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                            Descrição
                        </label>
                        <textarea
                            placeholder="O que você vende?"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full bg-secondary/30 border border-border px-6 py-4 rounded-2xl text-foreground font-bold outline-none focus:border-primary transition-all placeholder:text-muted-foreground/30 min-h-[100px]"
                        />
                    </div>

                    {/* LOCALIZAÇÃO */}
                    <div className="space-y-4">
                        <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                            Localização
                        </label>

                        {!location && !editingAddress && (
                            <div className="space-y-4">
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
                                                alert('Erro ao obter localização')
                                                setLoadingLocation(false)
                                            }
                                        )
                                    }}
                                    className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all"
                                >
                                    <MapPinned size={16} />
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
                                        className="w-full bg-secondary/30 border border-border px-6 py-4 rounded-2xl text-foreground font-bold outline-none focus:border-primary transition-all placeholder:text-muted-foreground/30"
                                    />
                                    {suggestions.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-2xl overflow-hidden z-50 shadow-2xl">
                                            {suggestions.map((s, i) => (
                                                <div
                                                    key={i}
                                                    onClick={() => selectSuggestion(s)}
                                                    className="p-4 hover:bg-muted cursor-pointer border-b border-border/50 last:border-0 text-sm font-bold"
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
                            <div className="p-5 border border-primary/30 bg-primary/5 rounded-2xl space-y-3">
                                <p className="text-sm font-bold text-foreground">{address}</p>
                                <button
                                    onClick={() => setEditingAddress(true)}
                                    className="flex items-center gap-2 text-primary hover:text-primary/80 text-[10px] uppercase font-black tracking-widest transition-colors"
                                >
                                    <Edit3 size={14} />
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
                                    className="w-full bg-secondary/30 border border-border px-6 py-4 rounded-2xl text-foreground font-bold outline-none focus:border-primary transition-all placeholder:text-muted-foreground/30"
                                />
                                {suggestions.length > 0 && (
                                    <div className="absolute top-[52px] left-0 right-0 bg-card border border-border rounded-2xl overflow-hidden z-50 shadow-2xl">
                                        {suggestions.map((s, i) => (
                                            <div
                                                key={i}
                                                onClick={() => selectSuggestion(s)}
                                                className="p-4 hover:bg-muted cursor-pointer border-b border-border/50 last:border-0 text-sm font-bold"
                                            >
                                                {s.place_name}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <button
                                    onClick={() => setEditingAddress(false)}
                                    className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2 hover:text-foreground transition-colors"
                                >
                                    <X size={14} />
                                    Cancelar edição
                                </button>
                            </div>
                        )}
                    </div>

                    {/* BOTÃO */}
                    <button
                        onClick={handleCreate}
                        disabled={loading}
                        className="w-full py-5 bg-foreground text-background font-black uppercase text-[11px] tracking-[0.3em] flex items-center justify-center gap-3 rounded-[24px] hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 shadow-2xl mt-4"
                    >
                        {loading ? 'Criando...' : 'Criar Loja'}
                    </button>
                </div>
            </div>
        </div>
    )
}