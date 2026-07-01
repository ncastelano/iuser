// src/app/(main)/[profileSlug]/[storeSlug]/editar-loja/page.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Camera, MapPin, Pencil, Trash2, ArrowLeft, Loader2, CheckCircle2, Store, Sparkles, Zap, Clock } from 'lucide-react'
import AnimatedBackground from '@/components/AnimatedBackground'
import { LoadingSpinner } from '@/components/LoadingSpinner'

const DAYS_OF_WEEK = [
    { key: 'mon', label: 'Segunda' },
    { key: 'tue', label: 'Terça' },
    { key: 'wed', label: 'Quarta' },
    { key: 'thu', label: 'Quinta' },
    { key: 'fri', label: 'Sexta' },
    { key: 'sat', label: 'Sábado' },
    { key: 'sun', label: 'Domingo' },
]

function parseLocation(loc: any): { lat: number; lng: number } | null {
    if (!loc) return null

    if (typeof loc === 'object' && loc.type === 'Point' && Array.isArray(loc.coordinates)) {
        const [lng, lat] = loc.coordinates
        if (!isNaN(lat) && !isNaN(lng)) return { lng, lat }
    }

    if (typeof loc === 'string') {
        const match = loc.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i)
        if (match) {
            const lng = parseFloat(match[1])
            const lat = parseFloat(match[2])
            if (!isNaN(lat) && !isNaN(lng)) return { lng, lat }
        }

        if (loc.startsWith('01') && loc.length >= 42) {
            try {
                const hexToDouble = (hex: string) => {
                    const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)))
                    const view = new DataView(bytes.buffer)
                    return view.getFloat64(0, true)
                }
                const lngHex = loc.substring(20, 36)
                const latHex = loc.substring(36, 52)
                const lng = hexToDouble(lngHex)
                const lat = hexToDouble(latHex)
                if (!isNaN(lat) && !isNaN(lng)) return { lng, lat }
            } catch (e) {
                console.warn('Erro ao decodificar EWKB:', e)
            }
        }
    }

    return null
}

export default function EditarLoja() {
    const router = useRouter()
    const params = useParams()

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
    const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
    const [address, setAddress] = useState('')
    const [whatsapp, setWhatsapp] = useState('')
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<string | null>(null)

    const [acceptsDelivery, setAcceptsDelivery] = useState(true)
    const [acceptsPickup, setAcceptsPickup] = useState(true)
    const [acceptsPix, setAcceptsPix] = useState(true)
    const [acceptsCard, setAcceptsCard] = useState(true)
    const [acceptsCash, setAcceptsCash] = useState(true)

    const [pixKey, setPixKey] = useState('')
    const [pixKeyType, setPixKeyType] = useState<'cpf' | 'email' | 'phone' | 'random'>('cpf')

    const [deliveryMode, setDeliveryMode] = useState<'free' | 'fixed' | 'distance'>('fixed')
    const [fixedDeliveryFee, setFixedDeliveryFee] = useState('')
    const [deliveryFeePerKm, setDeliveryFeePerKm] = useState('')

    const [businessHours, setBusinessHours] = useState<Record<string, { open: string; close: string }>>({})

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
                router.push('/eu')
                return
            }

            if (store.owner_id !== user.id) {
                alert('Você não tem permissão para editar esta loja.')
                router.push('/eu')
                return
            }

            setStoreId(store.id)
            setName(store.name || '')
            setStoreSlug(store.storeSlug || '')
            setDescription(store.description || '')
            setAddress(store.address || '')
            setWhatsapp(store.whatsapp || '')

            setAcceptsDelivery(store.accepts_delivery ?? true)
            setAcceptsPickup(store.accepts_pickup ?? true)
            setAcceptsPix(store.accepts_pix ?? true)
            setAcceptsCard(store.accepts_card ?? true)
            setAcceptsCash(store.accepts_cash ?? true)

            setPixKey(store.pix_key || '')
            setPixKeyType(store.pix_key_type || 'cpf')

            if (store.delivery_type === 'fixed') {
                setDeliveryMode('fixed')
                setFixedDeliveryFee(store.delivery_fee ? String(store.delivery_fee) : '')
            } else if (store.delivery_type === 'distance') {
                setDeliveryMode('distance')
                setDeliveryFeePerKm(store.delivery_fee_per_km ? String(store.delivery_fee_per_km) : '')
            } else if (store.delivery_type === 'free') {
                setDeliveryMode('free')
            } else {
                setDeliveryMode('fixed')
                setFixedDeliveryFee('')
            }

            setBusinessHours(store.business_hours || {})

            if (store.logo_url) {
                const url = supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl
                setPreview(url)
            }

            const coords = parseLocation(store.location)
            if (coords) {
                setLocation(coords)
                if (!store.address) fetchAddressFromCoords(coords.lat, coords.lng)
            } else {
                const lat = store.store_lat
                const lng = store.store_lng
                if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
                    setLocation({ lat, lng })
                    if (!store.address) fetchAddressFromCoords(lat, lng)
                } else {
                    setLocation(null)
                }
            }

            setPageLoading(false)
        }

        fetchStoreData()
    }, [storeSlugParam])

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
    }, [storeSlug, storeSlugParam, storeId])

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
            if (data?.features?.[0]) setAddress(data.features[0].place_name)
        } catch (e) { console.error(e) }
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
            } else alert('Endereço não encontrado.')
        } catch (e) { console.error(e); alert('Erro na busca.') }
    }

    const setTimeForDay = (day: string, type: 'open' | 'close', value: string) => {
        setBusinessHours(prev => ({ ...prev, [day]: { ...(prev[day] || { open: '', close: '' }), [type]: value } }))
    }
    const clearDay = (day: string) => {
        setBusinessHours(prev => { const n = { ...prev }; delete n[day]; return n })
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

        const latValue = location?.lat ?? null
        const lngValue = location?.lng ?? null
        const locationString = location ? `POINT(${lngValue} ${latValue})` : null

        // Montar entrega (variáveis locais com nomes diferentes dos estados)
        let deliveryType = 'none'
        let savedDeliveryFee: number | null = null
        let savedFeePerKm: number | null = null

        if (acceptsDelivery) {
            if (deliveryMode === 'free') {
                deliveryType = 'free'
                savedDeliveryFee = 0
            } else if (deliveryMode === 'fixed') {
                deliveryType = 'fixed'
                savedDeliveryFee = fixedDeliveryFee ? parseFloat(fixedDeliveryFee) : 0
            } else if (deliveryMode === 'distance') {
                deliveryType = 'distance'
                savedFeePerKm = deliveryFeePerKm ? parseFloat(deliveryFeePerKm) : 0  // <- CORRIGIDO
            }
        }

        const updateData: any = {
            name,
            storeSlug,
            description,
            location: locationString,
            store_lat: latValue,
            store_lng: lngValue,
            address,
            whatsapp: whatsapp.replace(/[^\d+]/g, '').trim() || null,
            accepts_delivery: acceptsDelivery,
            accepts_pickup: acceptsPickup,
            accepts_pix: acceptsPix,
            accepts_card: acceptsCard,
            accepts_cash: acceptsCash,
            pix_key: acceptsPix ? pixKey : null,
            pix_key_type: acceptsPix ? pixKeyType : null,
            delivery_type: deliveryType,
            delivery_fee: savedDeliveryFee,
            delivery_fee_per_km: savedFeePerKm,
            business_hours: businessHours,
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
        if (!confirm("Tem certeza que deseja deletar permanentemente esta loja?")) return
        setLoading(true)
        const { error } = await supabase.from('stores').delete().eq('id', storeId)
        if (error) {
            alert("Erro ao deletar loja.")
            setLoading(false)
            return
        }
        alert("Loja deletada com sucesso.")
        router.push('/eu')
    }

    if (pageLoading) return <LoadingSpinner />

    return (
        <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 pb-32">
            <AnimatedBackground />

            <style jsx global>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-15px) rotate(5deg); }
        }
      `}</style>

            <header className="sticky top-0 z-50 px-4 py-3 border-b border-orange-200/30 bg-white/60 backdrop-blur-xl">
                <div className="max-w-lg mx-auto flex items-center gap-3">
                    <button onClick={() => router.back()} className="flex w-10 h-10 items-center justify-center bg-white/80 border-2 border-orange-200 rounded-2xl hover:bg-orange-500 hover:text-white hover:border-orange-500 transition-all duration-300 shadow-md">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-lg font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">Editar Loja</h1>
                        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Painel Administrativo</p>
                    </div>
                </div>
            </header>

            <main className="relative z-10 flex-1 px-4 py-6 flex justify-center">
                <div className="w-full max-w-lg space-y-8">
                    <div className="flex items-center justify-center gap-3 flex-wrap">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-orange-600 bg-orange-100 px-3 py-1 rounded-full">
                            <Store className="w-3 h-3" /><span>Personalize</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-600 bg-red-100 px-3 py-1 rounded-full">
                            <Zap className="w-3 h-3" /><span>Atualize</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-yellow-600 bg-yellow-100 px-3 py-1 rounded-full">
                            <Sparkles className="w-3 h-3" /><span>Destaque-se</span>
                        </div>
                    </div>

                    <div className="bg-white/60 backdrop-blur-sm border-2 border-orange-200/50 rounded-3xl p-6 shadow-xl space-y-6">
                        {/* Logo */}
                        <div className="space-y-3">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-600 ml-1">Logo da Loja</label>
                            <div onClick={() => fileInputRef.current?.click()} className="relative w-32 h-32 mx-auto rounded-full overflow-hidden bg-gradient-to-br from-orange-100 to-red-100 border-2 border-orange-200 group cursor-pointer hover:border-orange-500 transition-all duration-500 shadow-lg">
                                {preview ? <img src={preview} className="w-full h-full object-cover" alt="Logo" /> : <div className="w-full h-full flex items-center justify-center text-orange-300 text-3xl font-black">!</div>}
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
                                    <Camera className="w-8 h-8 text-white" />
                                </div>
                                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files && setImageFile(e.target.files[0])} />
                            </div>
                        </div>

                        {/* Nome */}
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-600 ml-1">Nome da Loja</label>
                            <input placeholder="Minha Loja iUser" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-3 bg-white border-2 border-orange-200 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm transition-all focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" />
                        </div>

                        {/* Slug */}
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-600 ml-1">URL da Loja</label>
                            <div className="flex bg-white rounded-xl border-2 border-orange-200 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20 overflow-hidden transition-all">
                                <span className="flex items-center px-3 bg-orange-50 text-orange-400 border-r border-orange-200 text-[10px] font-bold">iuser.com.br/</span>
                                <input placeholder="minha-loja" value={storeSlug} onChange={(e) => setStoreSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} className="w-full px-4 py-3 bg-transparent text-gray-900 placeholder:text-gray-400 text-sm outline-none" />
                            </div>
                            {slugStatus === 'checking' && <p className="text-[9px] text-gray-400 ml-1 font-bold animate-pulse">Verificando...</p>}
                            {slugStatus === 'available' && <p className="text-[9px] text-green-600 ml-1 font-bold">✓ Disponível!</p>}
                            {slugStatus === 'taken' && <p className="text-[9px] text-red-500 ml-1 font-bold">✗ Já está em uso</p>}
                        </div>

                        {/* Descrição */}
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-600 ml-1">Descrição</label>
                            <textarea placeholder="Conte a história da sua marca..." value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full px-4 py-3 bg-white border-2 border-orange-200 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm transition-all focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 resize-none" />
                        </div>

                        {/* Localização */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between ml-1">
                                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-600">Localização da Sede</label>
                                {location && <span className="text-[8px] font-black text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">✓ Definida</span>}
                            </div>

                            {location ? (
                                <div className="bg-white rounded-2xl border-2 border-orange-200 p-4 shadow-sm space-y-4">
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                                            <MapPin className="w-5 h-5 text-orange-500" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[9px] font-black uppercase text-gray-400 mb-1">Endereço Registrado</p>
                                            <p className="text-sm font-bold text-gray-800 leading-tight">{address || 'Localização Definida'}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 pt-2 border-t border-orange-100">
                                        <button onClick={() => { const a = prompt("Novo endereço:", address); if (a) fetchCoordsFromAddress(a) }} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white border border-orange-200 rounded-xl text-[10px] font-black uppercase text-orange-600 hover:bg-orange-50 transition-all">
                                            <Pencil className="w-3 h-3" />Mudar Endereço
                                        </button>
                                        <button onClick={() => { setLocation(null); setAddress('') }} className="px-4 py-2 bg-red-50 border border-red-100 rounded-xl text-[10px] font-black uppercase text-red-500 hover:bg-red-500 hover:text-white transition-all">
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button disabled={loadingLocation} onClick={() => { setLoadingLocation(true); navigator.geolocation.getCurrentPosition((pos) => { const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }; setLocation(coords); fetchAddressFromCoords(coords.lat, coords.lng); setLoadingLocation(false); }, () => { alert('Não foi possível obter localização.'); setLoadingLocation(false); }) }} className="w-full p-6 bg-white border-2 border-dashed border-orange-200 hover:border-orange-500 text-gray-500 hover:text-orange-600 rounded-2xl transition-all flex flex-col items-center justify-center gap-3 font-bold text-sm">
                                    <div className="w-14 h-14 rounded-full bg-orange-50 flex items-center justify-center">{loadingLocation ? <Loader2 className="w-6 h-6 animate-spin text-orange-500" /> : <MapPin className="w-6 h-6 text-orange-400" />}</div>
                                    {loadingLocation ? 'Obtendo localização...' : 'Definir Localização Atual'}
                                </button>
                            )}
                        </div>

                        {/* WhatsApp */}
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-600 ml-1">WhatsApp (opcional)</label>
                            <input placeholder="(00) 00000-0000" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="w-full px-4 py-3 bg-white border-2 border-orange-200 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm transition-all focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" />
                            <p className="text-[9px] text-gray-400 ml-1 font-medium">Se vazio, usaremos o WhatsApp do seu perfil.</p>
                        </div>

                        {/* Configurações de Venda */}
                        <div className="space-y-4">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-600 ml-1">Configurações de Venda</label>

                            {/* Entrega / Retirada */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex items-center justify-between bg-white border-2 border-orange-200 rounded-xl p-3">
                                    <span className="text-xs font-bold text-gray-700">📍 Faz entrega</span>
                                    <button onClick={() => setAcceptsDelivery(!acceptsDelivery)} className={`relative w-11 h-6 rounded-full transition-colors ${acceptsDelivery ? 'bg-orange-500' : 'bg-gray-300'}`}>
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${acceptsDelivery ? 'right-1' : 'left-1'}`} />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between bg-white border-2 border-orange-200 rounded-xl p-3">
                                    <span className="text-xs font-bold text-gray-700">🏪 Retirada no local</span>
                                    <button onClick={() => setAcceptsPickup(!acceptsPickup)} className={`relative w-11 h-6 rounded-full transition-colors ${acceptsPickup ? 'bg-orange-500' : 'bg-gray-300'}`}>
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${acceptsPickup ? 'right-1' : 'left-1'}`} />
                                    </button>
                                </div>
                            </div>

                            {/* Detalhes da entrega */}
                            {acceptsDelivery && (
                                <div className="ml-2 space-y-2">
                                    <p className="text-[10px] font-bold text-gray-500">Tipo de entrega</p>
                                    <div className="flex gap-2">
                                        <button onClick={() => setDeliveryMode('free')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${deliveryMode === 'free' ? 'bg-orange-500 text-white' : 'bg-white border border-gray-300 text-gray-600'}`}>Grátis</button>
                                        <button onClick={() => setDeliveryMode('fixed')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${deliveryMode === 'fixed' ? 'bg-orange-500 text-white' : 'bg-white border border-gray-300 text-gray-600'}`}>Valor Fixo</button>
                                        <button onClick={() => setDeliveryMode('distance')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${deliveryMode === 'distance' ? 'bg-orange-500 text-white' : 'bg-white border border-gray-300 text-gray-600'}`}>Por Distância</button>
                                    </div>

                                    {deliveryMode === 'fixed' && (
                                        <input type="number" value={fixedDeliveryFee} onChange={e => setFixedDeliveryFee(e.target.value)} placeholder="Valor da entrega (R$)" className="w-full bg-white border-2 border-orange-200 rounded-xl px-3 py-2 text-sm" />
                                    )}
                                    {deliveryMode === 'distance' && (
                                        <input type="number" value={deliveryFeePerKm} onChange={e => setDeliveryFeePerKm(e.target.value)} placeholder="Valor por km (R$)" className="w-full bg-white border-2 border-orange-200 rounded-xl px-3 py-2 text-sm" />
                                    )}
                                </div>
                            )}

                            {/* Pagamento */}
                            <div className="grid grid-cols-3 gap-3 mt-2">
                                <div className="flex items-center justify-between bg-white border-2 border-orange-200 rounded-xl p-3">
                                    <span className="text-xs font-bold text-gray-700">💳 Cartão</span>
                                    <button onClick={() => setAcceptsCard(!acceptsCard)} className={`relative w-11 h-6 rounded-full transition-colors ${acceptsCard ? 'bg-orange-500' : 'bg-gray-300'}`}>
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${acceptsCard ? 'right-1' : 'left-1'}`} />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between bg-white border-2 border-orange-200 rounded-xl p-3">
                                    <span className="text-xs font-bold text-gray-700">⚡ PIX</span>
                                    <button onClick={() => setAcceptsPix(!acceptsPix)} className={`relative w-11 h-6 rounded-full transition-colors ${acceptsPix ? 'bg-orange-500' : 'bg-gray-300'}`}>
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${acceptsPix ? 'right-1' : 'left-1'}`} />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between bg-white border-2 border-orange-200 rounded-xl p-3">
                                    <span className="text-xs font-bold text-gray-700">💵 Dinheiro</span>
                                    <button onClick={() => setAcceptsCash(!acceptsCash)} className={`relative w-11 h-6 rounded-full transition-colors ${acceptsCash ? 'bg-orange-500' : 'bg-gray-300'}`}>
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${acceptsCash ? 'right-1' : 'left-1'}`} />
                                    </button>
                                </div>
                            </div>

                            {/* Chave Pix */}
                            {acceptsPix && (
                                <div className="ml-2 space-y-2">
                                    <p className="text-[10px] font-bold text-gray-500">Chave Pix</p>
                                    <select value={pixKeyType} onChange={e => setPixKeyType(e.target.value as any)} className="w-full bg-white border-2 border-orange-200 rounded-xl px-3 py-2 text-sm">
                                        <option value="cpf">CPF</option>
                                        <option value="email">E-mail</option>
                                        <option value="phone">Telefone</option>
                                        <option value="random">Chave aleatória</option>
                                    </select>
                                    <input type="text" value={pixKey} onChange={e => setPixKey(e.target.value)} placeholder="Digite a chave" className="w-full bg-white border-2 border-orange-200 rounded-xl px-3 py-2 text-sm" />
                                </div>
                            )}
                        </div>

                        {/* Horários de Funcionamento */}
                        <div className="space-y-3">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-600 ml-1 flex items-center gap-2">
                                <Clock size={14} /> Horários de Funcionamento
                            </label>
                            {DAYS_OF_WEEK.map(day => {
                                const current = businessHours[day.key] || { open: '', close: '' }
                                return (
                                    <div key={day.key} className="flex items-center gap-2">
                                        <span className="w-20 text-xs font-bold text-gray-700">{day.label}</span>
                                        <input type="time" value={current.open} onChange={e => setTimeForDay(day.key, 'open', e.target.value)} className="bg-white border-2 border-orange-200 rounded-lg px-2 py-1 text-xs flex-1" />
                                        <span className="text-xs text-gray-400">-</span>
                                        <input type="time" value={current.close} onChange={e => setTimeForDay(day.key, 'close', e.target.value)} className="bg-white border-2 border-orange-200 rounded-lg px-2 py-1 text-xs flex-1" />
                                        <button onClick={() => clearDay(day.key)} className="text-xs text-red-400">Fechado</button>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Botões */}
                        <div className="pt-4 space-y-3">
                            <button onClick={handleUpdate} disabled={loading || slugStatus === 'taken'} className="group relative w-full bg-gradient-to-r from-orange-500 to-red-500 text-white py-3.5 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                                {loading ? 'Salvando...' : 'Salvar Alterações'}
                            </button>
                            <button onClick={handleDelete} disabled={loading} className="w-full bg-red-50 hover:bg-red-500 text-red-500 hover:text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-wider border-2 border-red-200 hover:border-red-500 transition-all flex items-center justify-center gap-2">
                                <Trash2 className="w-4 h-4" /> Deletar Loja
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}