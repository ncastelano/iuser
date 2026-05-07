'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Camera, MapPin, Pencil, Trash2, ArrowLeft, Loader2, CheckCircle2, Globe, Store, Sparkles, Zap } from 'lucide-react'
import AnimatedBackground from '@/components/AnimatedBackground'

export default function EditarLoja() {
    const router = useRouter()
    const params = useParams()
    const supabase = createClient()

    const storeSlugParam = Array.isArray(params.storeSlug) ? params.storeSlug[0] : params.storeSlug
    const profileSlug = Array.isArray(params.profileSlug) ? params.profileSlug[0] : params.profileSlug

    const fileInputRef = useRef<HTMLInputElement | null>(null)

    const [storeId, setStoreId] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [loadingLocation, setLoadingLocation] = useState(false)
    const [pageLoading, setPageLoading] = useState(true)
    const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')

    const [name, setName] = useState('')
    const [storeSlug, setStoreSlug] = useState('')
    const [description, setDescription] = useState('')
    const [location, setLocation] = useState<{ lat: number, lng: number } | null>(null)
    const [address, setAddress] = useState('')
    const [whatsapp, setWhatsapp] = useState('')
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<string | null>(null)

    // INITIAL LOAD
    useEffect(() => {
        const fetchStoreData = async () => {
            if (!storeSlugParam) return

            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/login')
                return
            }

            const { data: store, error } = await supabase
                .from('stores')
                .select('*')
                .ilike('storeSlug', storeSlugParam)
                .single()

            if (error || !store) {
                alert('Loja não encontrada.')
                router.push('/painel')
                return
            }

            if (store.owner_id !== user.id) {
                alert('Você não tem permissão para editar esta loja.')
                router.push('/painel')
                return
            }

            setStoreId(store.id)
            setName(store.name || '')
            setStoreSlug(store.storeSlug || '')
            setDescription(store.description || '')
            setAddress(store.address || '')
            setWhatsapp(store.whatsapp || '')

            if (store.logo_url) {
                const url = supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl
                setPreview(url)
            }

            if (store.location) {
                let coords: { lat: number, lng: number } | null = null;

                if (typeof store.location === 'string') {
                    const match = store.location.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i);
                    if (match) {
                        coords = { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
                    }
                } else if (typeof store.location === 'object' && store.location !== null) {
                    if (store.location.type === 'Point' && Array.isArray(store.location.coordinates)) {
                        coords = { lng: store.location.coordinates[0], lat: store.location.coordinates[1] };
                    }
                }

                if (coords) {
                    setLocation(coords);
                    if (!store.address) {
                        fetchAddressFromCoords(coords.lat, coords.lng);
                    }
                }
            }

            setPageLoading(false)
        }

        fetchStoreData()
    }, [storeSlugParam])

    // SLUG CHECK
    useEffect(() => {
        if (!storeSlug || storeSlug === storeSlugParam) {
            setSlugStatus('idle')
            return
        }

        const check = async () => {
            setSlugStatus('checking')
            const { data } = await supabase.from('stores').select('id').eq('storeSlug', storeSlug).neq('id', storeId).limit(1).maybeSingle()
            setSlugStatus(data ? 'taken' : 'available')
        }

        const timer = setTimeout(check, 600)
        return () => clearTimeout(timer)
    }, [storeSlug, storeSlugParam, storeId, supabase])

    // IMAGE PREVIEW
    useEffect(() => {
        if (!imageFile) return
        const url = URL.createObjectURL(imageFile)
        setPreview(url)
        return () => URL.revokeObjectURL(url)
    }, [imageFile])

    const fetchAddressFromCoords = async (lat: number, lng: number) => {
        try {
            const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
            const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}`)
            const data = await res.json()
            if (data?.features?.[0]) {
                setAddress(data.features[0].place_name)
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
            if (data?.features?.[0]) {
                const [lon, lat] = data.features[0].center
                setLocation({ lat, lng: lon })
                setAddress(data.features[0].place_name)
            } else {
                alert('Endereço não encontrado.')
            }
        } catch (e) {
            console.error(e)
            alert('Erro na busca.')
        }
    }

    const handleUpdate = async () => {
        if (!name || !storeSlug || !storeId) {
            alert('Preencha os campos obrigatórios.')
            return
        }

        if (slugStatus === 'taken') {
            alert('O endereço da loja já está em uso.')
            return
        }

        setLoading(true)

        let logoPath: string | undefined = undefined

        if (imageFile) {
            const fileExt = imageFile.name.split('.').pop()
            const fileName = `${Date.now()}.${fileExt}`
            const { data, error } = await supabase.storage.from('store-logos').upload(fileName, imageFile)
            if (!error && data) logoPath = data.path
        }

        const locationString = location ? `POINT(${location.lng} ${location.lat})` : null

        const updateData: any = {
            name,
            storeSlug,
            description,
            location: locationString,
            address: address,
            whatsapp: whatsapp.replace(/[^\d+]/g, '').trim() || null
        }

        if (logoPath) updateData.logo_url = logoPath

        const { error } = await supabase.from('stores').update(updateData).eq('id', storeId)

        if (error) {
            alert('Erro ao atualizar loja: ' + error.message)
            setLoading(false)
            return
        }

        setLoading(false)
        router.push(`/${profileSlug}/${storeSlug}`)
    }

    const handleDelete = async () => {
        if (!confirm("Tem certeza que deseja deletar permanentemente esta loja? Todos os produtos e dados serão excluídos. Esta ação não pode ser desfeita.")) {
            return
        }

        setLoading(true)
        const { error } = await supabase.from('stores').delete().eq('id', storeId)

        if (error) {
            alert("Erro ao deletar loja.")
            setLoading(false)
            return
        }

        alert("Loja deletada com sucesso.")
        router.push('/painel')
    }

    if (pageLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                    <p className="text-orange-600 text-sm font-bold">Carregando loja...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 pb-32">
            <AnimatedBackground />

            <style jsx global>{`
                @keyframes float {
                    0%, 100% { transform: translateY(0px) rotate(0deg); }
                    50% { transform: translateY(-15px) rotate(5deg); }
                }
            `}</style>

            {/* Header */}
            <header className="sticky top-0 z-50 px-4 py-3 border-b border-orange-200/30 bg-white/60 backdrop-blur-xl">
                <div className="max-w-lg mx-auto flex items-center gap-3">
                    <button
                        onClick={() => router.back()}
                        className="flex w-10 h-10 items-center justify-center bg-white/80 border-2 border-orange-200 rounded-2xl hover:bg-orange-500 hover:text-white hover:border-orange-500 transition-all duration-300 shadow-md"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-lg font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                            Editar Loja
                        </h1>
                        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Painel Administrativo</p>
                    </div>
                </div>
            </header>

            <main className="relative z-10 flex-1 px-4 py-6 flex justify-center">
                <div className="w-full max-w-lg space-y-8">
                    {/* Feature badges */}
                    <div className="flex items-center justify-center gap-3 flex-wrap">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-orange-600 bg-orange-100 px-3 py-1 rounded-full">
                            <Store className="w-3 h-3" />
                            <span>Personalize</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-600 bg-red-100 px-3 py-1 rounded-full">
                            <Zap className="w-3 h-3" />
                            <span>Atualize</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-yellow-600 bg-yellow-100 px-3 py-1 rounded-full">
                            <Sparkles className="w-3 h-3" />
                            <span>Destaque-se</span>
                        </div>
                    </div>

                    {/* Form Card */}
                    <div className="bg-white/60 backdrop-blur-sm border-2 border-orange-200/50 rounded-3xl p-6 shadow-xl space-y-6">
                        {/* Image Upload */}
                        <div className="space-y-3">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-600 ml-1">
                                Logo da Loja
                            </label>
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="relative w-32 h-32 mx-auto rounded-full overflow-hidden bg-gradient-to-br from-orange-100 to-red-100 border-2 border-orange-200 group cursor-pointer hover:border-orange-500 transition-all duration-500 shadow-lg"
                            >
                                {preview ? (
                                    <img src={preview} className="w-full h-full object-cover" alt="Logo" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-orange-300 text-3xl font-black">!</div>
                                )}
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
                                    <Camera className="w-8 h-8 text-white" />
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => e.target.files && setImageFile(e.target.files[0])}
                                />
                            </div>
                        </div>

                        {/* Nome */}
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-600 ml-1">
                                Nome da Loja
                            </label>
                            <input
                                placeholder="Minha Loja iUser"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-4 py-3 bg-white border-2 border-orange-200 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm transition-all focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                            />
                        </div>

                        {/* Slug */}
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-600 ml-1">
                                URL da Loja
                            </label>
                            <div className="flex bg-white rounded-xl border-2 border-orange-200 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20 overflow-hidden transition-all">
                                <span className="flex items-center px-3 bg-orange-50 text-orange-400 border-r border-orange-200 text-[10px] font-bold">
                                    iuser.com.br/
                                </span>
                                <input
                                    placeholder="minha-loja"
                                    value={storeSlug}
                                    onChange={(e) => setStoreSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                    className="w-full px-4 py-3 bg-transparent text-gray-900 placeholder:text-gray-400 text-sm outline-none"
                                />
                            </div>
                            {slugStatus === 'checking' && (
                                <p className="text-[9px] text-gray-400 ml-1 font-bold animate-pulse">Verificando...</p>
                            )}
                            {slugStatus === 'available' && (
                                <p className="text-[9px] text-green-600 ml-1 font-bold">✓ Disponível!</p>
                            )}
                            {slugStatus === 'taken' && (
                                <p className="text-[9px] text-red-500 ml-1 font-bold">✗ Já está em uso</p>
                            )}
                        </div>

                        {/* Descrição */}
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-600 ml-1">
                                Descrição
                            </label>
                            <textarea
                                placeholder="Conte a história da sua marca..."
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={4}
                                className="w-full px-4 py-3 bg-white border-2 border-orange-200 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm transition-all focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 resize-none"
                            />
                        </div>

                        {/* Localização */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between ml-1">
                                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-600">
                                    Localização da Sede
                                </label>
                                {location && (
                                    <span className="text-[8px] font-black text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                                        ✓ Definida
                                    </span>
                                )}
                            </div>

                            {location ? (
                                <div className="bg-white rounded-2xl border-2 border-orange-200 p-4 shadow-sm space-y-4">
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                                            <MapPin className="w-5 h-5 text-orange-500" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[9px] font-black uppercase text-gray-400 mb-1">Endereço Registrado</p>
                                            <p className="text-sm font-bold text-gray-800 leading-tight">
                                                {address || 'Localização Definida (sem endereço textual)'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-2 pt-2 border-t border-orange-100">
                                        <button
                                            onClick={() => {
                                                const newAddress = prompt("Digite o novo endereço completo:", address)
                                                if (newAddress) fetchCoordsFromAddress(newAddress)
                                            }}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white border border-orange-200 rounded-xl text-[10px] font-black uppercase text-orange-600 hover:bg-orange-50 transition-all"
                                        >
                                            <Pencil className="w-3 h-3" />
                                            Mudar Endereço
                                        </button>
                                        <button
                                            onClick={() => { setLocation(null); setAddress(''); }}
                                            className="px-4 py-2 bg-red-50 border border-red-100 rounded-xl text-[10px] font-black uppercase text-red-500 hover:bg-red-500 hover:text-white transition-all"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    disabled={loadingLocation}
                                    onClick={() => {
                                        setLoadingLocation(true)
                                        navigator.geolocation.getCurrentPosition(
                                            (pos) => {
                                                const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                                                setLocation(coords)
                                                fetchAddressFromCoords(coords.lat, coords.lng)
                                                setLoadingLocation(false)
                                            },
                                            (err) => {
                                                console.error(err);
                                                alert('Não foi possível obter sua localização. Tente digitar o endereço.');
                                                setLoadingLocation(false);
                                            }
                                        );
                                    }}
                                    className="w-full p-6 bg-white border-2 border-dashed border-orange-200 hover:border-orange-500 text-gray-500 hover:text-orange-600 rounded-2xl transition-all flex flex-col items-center justify-center gap-3 font-bold text-sm"
                                >
                                    <div className="w-14 h-14 rounded-full bg-orange-50 flex items-center justify-center">
                                        {loadingLocation ? (
                                            <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                                        ) : (
                                            <MapPin className="w-6 h-6 text-orange-400" />
                                        )}
                                    </div>
                                    {loadingLocation ? 'Obtendo localização...' : 'Definir Localização Atual'}
                                </button>
                            )}
                        </div>

                        {/* WhatsApp */}
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-600 ml-1">
                                WhatsApp (opcional)
                            </label>
                            <input
                                placeholder="(00) 00000-0000"
                                value={whatsapp}
                                onChange={(e) => setWhatsapp(e.target.value)}
                                className="w-full px-4 py-3 bg-white border-2 border-orange-200 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm transition-all focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                            />
                            <p className="text-[9px] text-gray-400 ml-1 font-medium">
                                Se vazio, usaremos o WhatsApp das suas configurações.
                            </p>
                        </div>

                        {/* Botões */}
                        <div className="pt-4 space-y-3">
                            <button
                                onClick={handleUpdate}
                                disabled={loading || slugStatus === 'taken'}
                                className="group relative w-full bg-gradient-to-r from-orange-500 to-red-500 text-white py-3.5 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <CheckCircle2 className="w-5 h-5" />
                                )}
                                {loading ? 'Salvando...' : 'Salvar Alterações'}
                            </button>

                            <button
                                onClick={handleDelete}
                                disabled={loading}
                                className="w-full bg-red-50 hover:bg-red-500 text-red-500 hover:text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-wider border-2 border-red-200 hover:border-red-500 transition-all flex items-center justify-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" />
                                Deletar Loja
                            </button>
                        </div>
                    </div>

                    {/* Mensagem final */}
                    <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-orange-200/50 text-center">
                        <p className="text-[11px] text-gray-600">
                            ✨ <span className="font-black text-orange-600">Mantenha sua loja</span> sempre atualizada para atrair mais clientes.
                        </p>
                    </div>
                </div>
            </main>
        </div>
    )
}