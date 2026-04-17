'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Camera, MapPin, Pencil, Trash2, ArrowLeft, Loader2, CheckCircle2, Globe } from 'lucide-react'

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
                router.push('/dashboard')
                return
            }

            if (store.owner_id !== user.id) {
                alert('Você não tem permissão para editar esta loja.')
                router.push('/dashboard')
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
                } else if (store.location.type === 'Point' && store.location.coordinates) {
                    coords = { lng: store.location.coordinates[0], lat: store.location.coordinates[1] };
                }

                if (coords) {
                    setLocation(coords);
                    fetchAddressFromCoords(coords.lat, coords.lng);
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
        router.push('/dashboard')
    }

    if (pageLoading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center text-white">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-8 h-8 animate-spin text-white/20" />
                    <span className="text-neutral-500 font-black uppercase tracking-widest text-[10px]">Lendo dados da loja...</span>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-black text-white p-4 md:p-8 flex justify-center pb-40 selection:bg-white selection:text-black">
            <div className="w-full max-w-lg mt-8 space-y-12">
                <div className="flex justify-between items-end">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3 text-neutral-500 mb-4">
                            <button onClick={() => router.back()} className="w-10 h-10 flex items-center justify-center bg-white/5 rounded-2xl border border-white/5 hover:bg-white hover:text-black transition-all">
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <span className="text-[10px] font-black uppercase tracking-[0.3em]">Gerenciamento Geral</span>
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter">Editar Loja</h1>
                        <p className="text-neutral-400 text-[10px] font-bold uppercase tracking-widest">Painel Administrativo iUser</p>
                    </div>
                </div>

                <div className="bg-neutral-900/40 backdrop-blur-xl border border-white/5 p-8 rounded-[40px] shadow-2xl space-y-8">
                    {/* Image Upload */}
                    <div className="space-y-4">
                        <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-neutral-600 mb-2 ml-1">Identidade Visual (Logo)</label>
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="relative w-40 h-40 mx-auto rounded-[32px] overflow-hidden bg-black p-1 border border-white/10 group cursor-pointer hover:border-white transition-all duration-500 shadow-2xl"
                        >
                            {preview ? (
                                <img src={preview} className="w-full h-full object-cover rounded-[28px]" alt="Store Logo" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-neutral-800 text-5xl font-black italic">!</div>
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                                <Camera className="w-10 h-10 text-white" />
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

                    <div className="space-y-8">
                        {/* NOME */}
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-neutral-600 ml-1">Nome Oficial da Loja</label>
                            <input
                                placeholder="Minha Loja iUser"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full p-4 bg-neutral-950 text-white rounded-2xl border border-white/5 focus:border-white/20 outline-none transition-all font-bold placeholder:text-neutral-800"
                            />
                        </div>

                        {/* SLUG */}
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-neutral-600 ml-1">URL Personalizada (Slug)</label>
                            <div className="flex bg-neutral-950 rounded-2xl border border-white/5 focus-within:border-white/20 overflow-hidden transition-all">
                                <span className="flex items-center px-4 bg-white/5 text-neutral-600 border-r border-white/5 text-[10px] font-black uppercase tracking-widest">
                                    iuser.com.br/
                                </span>
                                <input
                                    placeholder="minha-loja"
                                    value={storeSlug}
                                    onChange={(e) => setStoreSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                    className="w-full p-4 bg-transparent text-white outline-none font-bold"
                                />
                            </div>
                            {slugStatus === 'checking' && <p className="text-[9px] text-neutral-600 ml-1 uppercase font-bold animate-pulse">Verificando disponibilidade...</p>}
                            {slugStatus === 'available' && <p className="text-[9px] text-green-500 ml-1 uppercase font-bold">✓ Endereço liberado!</p>}
                            {slugStatus === 'taken' && <p className="text-[9px] text-red-500 ml-1 uppercase font-bold">✗ Endereço já ocupado.</p>}
                            <p className="text-[9px] text-neutral-700 ml-1 uppercase font-black tracking-widest italic">Aviso: Mudar o slug alterará o link de acesso da sua loja.</p>
                        </div>

                        {/* DESCRIÇÃO */}
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-neutral-600 ml-1">Biografia / Descrição</label>
                            <textarea
                                placeholder="Conte a história da sua marca..."
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={4}
                                className="w-full p-4 bg-neutral-950 text-white rounded-2xl border border-white/5 focus:border-white/20 outline-none transition-all font-medium placeholder:text-neutral-800 resize-none leading-relaxed"
                            />
                        </div>

                        {/* LOCALIZAÇÃO */}
                        <div className="space-y-3">
                            <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-neutral-600 ml-1">Sede da Loja (Localização)</label>
                            {location ? (
                                <div className="p-6 bg-neutral-950 text-white rounded-2xl border border-white/10 space-y-4">
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                                            <MapPin className="w-5 h-5 text-white" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-600 italic">Endereço Detectado</p>
                                            <p className="text-xs font-bold leading-relaxed">{address || 'Coordenadas: ' + location.lat.toFixed(4) + ', ' + location.lng.toFixed(4)}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => {
                                                const newAddress = prompt("Digite o novo endereço completo:", address)
                                                if (newAddress) fetchCoordsFromAddress(newAddress)
                                            }}
                                            className="flex-1 py-3 px-4 bg-white/5 hover:bg-white text-white hover:text-black rounded-xl text-[9px] font-black uppercase tracking-widest border border-white/10 transition-all flex items-center justify-center gap-2"
                                        >
                                            <Pencil className="w-3.5 h-3.5" /> Editar Endereço
                                        </button>
                                        <button
                                            onClick={() => { setLocation(null); setAddress(''); }}
                                            className="py-3 px-4 bg-red-500/10 text-red-500 rounded-xl text-[9px] font-black uppercase tracking-widest border border-red-500/20 hover:bg-red-500 hover:text-white transition-all"
                                        >
                                            Limpar
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
                                                setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
                                                fetchAddressFromCoords(pos.coords.latitude, pos.coords.longitude)
                                                setLoadingLocation(false)
                                            },
                                            () => { alert('Erro ao buscar localização'); setLoadingLocation(false); }
                                        );
                                    }}
                                    className="w-full p-4 bg-neutral-950 border border-white/5 hover:border-white/20 text-neutral-600 hover:text-white rounded-2xl transition-all flex items-center justify-center gap-3 font-black uppercase text-[10px] tracking-[0.2em]"
                                >
                                    {loadingLocation ? <Loader2 className="w-5 h-5 animate-spin" /> : <Globe className="w-5 h-5" />}
                                    {loadingLocation ? 'Sincronizando...' : 'Adicionar Localização da Sede'}
                                </button>
                        </div>

                        {/* WHATSAPP */}
                        <div className="space-y-3">
                            <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-neutral-600 ml-1">WhatsApp da Loja (Opcional)</label>
                            <input
                                placeholder="(00) 00000-0000"
                                value={whatsapp}
                                onChange={(e) => setWhatsapp(e.target.value)}
                                className="w-full p-4 bg-neutral-950 text-white rounded-2xl border border-white/5 focus:border-white/20 outline-none transition-all font-bold placeholder:text-neutral-800"
                            />
                            <p className="text-[9px] text-neutral-600 ml-1 uppercase font-black tracking-widest italic leading-tight">
                                Se vazio, usaremos o WhatsApp das suas <button onClick={() => router.push('/configuracoes')} className="text-white hover:underline">Configurações Gerais</button>. Esse número receberá os avisos de novos pedidos!
                            </p>
                        </div>
                    </div>

                    {/* BOTÕES */}
                    <div className="pt-8 space-y-4">
                        <button
                            onClick={handleUpdate}
                            disabled={loading || slugStatus === 'taken'}
                            className="w-full bg-white text-black py-5 rounded-2xl font-black uppercase text-[11px] tracking-[0.3em] hover:bg-neutral-200 active:scale-[0.98] transition-all disabled:opacity-30 shadow-[0_10px_30px_rgba(255,255,255,0.1)] flex items-center justify-center gap-3"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                            {loading ? 'Processando...' : 'Salvar Configurações'}
                        </button>

                        <button
                            onClick={handleDelete}
                            disabled={loading}
                            className="w-full bg-red-500/5 hover:bg-red-500 text-red-500 hover:text-white py-5 rounded-2xl font-black uppercase text-[11px] tracking-[0.3em] border border-red-500/20 transition-all flex items-center justify-center gap-3"
                        >
                            <Trash2 className="w-5 h-5" />
                            Deletar Loja Permanentemente
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
