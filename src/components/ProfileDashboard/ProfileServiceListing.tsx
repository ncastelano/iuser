// components/ProfileServiceListing.tsx
//
// "Meus serviços publicados" — um anúncio do serviço que a pessoa presta,
// igual uma Publicação (mesma tabela products, listing_type='service_offer'),
// mas com localização: aparece como pin no mapa de /solicitar-servico, onde
// clientes veem todos os serviços disponíveis na plataforma.
'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { toast } from 'sonner'
import { hexToRgb } from '@/lib/color'
import { getCurrentPosition as getNativeCurrentPosition } from '@/lib/nativeGeolocation'
import { SERVICE_TYPES, ServiceType } from '@/lib/serviceTypes'
import {
    ChevronDown,
    ChevronUp,
    Plus,
    ImageIcon,
    Send,
    Trash2,
    Wrench,
    MapPin,
    MapPinPlus,
    Map as MapIcon,
    Pencil,
} from 'lucide-react'
import { generateUniqueGlobalSlug } from '@/lib/slugUtils'
import { Spinner } from '@/components/Spinner'

interface ServiceListing {
    id: string
    name: string
    description?: string
    image_url: string | null
    slug: string
    service_type: string | null
    address: string | null
    lat: number | null
    lng: number | null
    created_at: string
}

interface ProfileServiceListingProps {
    profileId: string
    profileSlug: string
}

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

const pillButtonStyle = {
    padding: '0.5rem 1rem',
    borderRadius: '9999px',
    fontWeight: 700,
    fontSize: '0.75rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    border: 'none',
    textDecoration: 'none',
}

async function reverseGeocode(lng: number, lat: number): Promise<string | null> {
    try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
        const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&language=pt&types=address,place,locality`
        )
        const data = await res.json()
        return data.features?.[0]?.place_name || null
    } catch {
        return null
    }
}

export default function ProfileServiceListing({ profileId, profileSlug }: ProfileServiceListingProps) {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [isExpanded, setIsExpanded] = useState(true)
    const [isCreating, setIsCreating] = useState(false)
    const [listings, setListings] = useState<ServiceListing[]>([])
    const [loading, setLoading] = useState(false)

    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [serviceType, setServiceType] = useState<ServiceType | ''>('')
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    const [address, setAddress] = useState('')
    const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
    const [locating, setLocating] = useState(false)

    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

    useEffect(() => {
        if (!isExpanded || !profileId) return
        let isMounted = true

        const load = async () => {
            setLoading(true)
            try {
                const { data, error } = await supabase
                    .from('products')
                    .select('id, name, description, image_url, slug, service_type, address, lat, lng, created_at')
                    .eq('owner_id', profileId)
                    .eq('listing_type', 'service_offer')
                    .order('created_at', { ascending: false })

                if (!error && data && isMounted) {
                    setListings(data as ServiceListing[])
                }
            } catch (err) {
                console.error('[ProfileServiceListing] Erro ao carregar:', err)
            } finally {
                if (isMounted) setLoading(false)
            }
        }
        load()

        return () => { isMounted = false }
    }, [isExpanded, profileId])

    useEffect(() => {
        if (!imageFile) return
        const url = URL.createObjectURL(imageFile)
        setPreview(url)
        return () => URL.revokeObjectURL(url)
    }, [imageFile])

    const useMyLocation = () => {
        setLocating(true)
        getNativeCurrentPosition(
            async (pos) => {
                const lat = pos.coords.latitude
                const lng = pos.coords.longitude
                const place = await reverseGeocode(lng, lat)
                setCoords({ lat, lng })
                setAddress(place || `${lat.toFixed(4)}, ${lng.toFixed(4)}`)
                setLocating(false)
            },
            () => {
                toast.error('Não conseguimos acessar sua localização')
                setLocating(false)
            },
            { enableHighAccuracy: true, timeout: 10000 }
        )
    }

    const resetForm = () => {
        setIsCreating(false)
        setName('')
        setDescription('')
        setServiceType('')
        setImageFile(null)
        setPreview(null)
        setAddress('')
        setCoords(null)
    }

    const handleCreate = async () => {
        if (!name.trim()) {
            toast.error('Dê um nome ao serviço')
            return
        }
        if (!serviceType) {
            toast.error('Escolha o tipo de serviço')
            return
        }
        setSaving(true)
        try {
            let imagePath: string | null = null
            if (imageFile) {
                const fileExt = imageFile.name.split('.').pop()
                const fileName = `${Date.now()}.${fileExt}`
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('product-images')
                    .upload(fileName, imageFile)
                if (uploadError) throw uploadError
                imagePath = uploadData?.path ?? null
            }

            const slug = await generateUniqueGlobalSlug(name)

            const { error: insertError } = await supabase.from('products').insert({
                name,
                slug,
                description: description || null,
                price: 0,
                type: 'service',
                price_type: 'fixed',
                listing_type: 'service_offer',
                service_type: serviceType,
                image_url: imagePath,
                address: address || null,
                lat: coords?.lat ?? null,
                lng: coords?.lng ?? null,
                owner_id: profileId,
                store_id: null,
            })

            if (insertError) throw insertError

            toast.success('Serviço publicado com sucesso!')
            resetForm()

            const { data: freshData } = await supabase
                .from('products')
                .select('id, name, description, image_url, slug, service_type, address, lat, lng, created_at')
                .eq('owner_id', profileId)
                .eq('listing_type', 'service_offer')
                .order('created_at', { ascending: false })
            if (freshData) setListings(freshData as ServiceListing[])
        } catch (err: any) {
            console.error('Erro ao publicar serviço:', err)
            toast.error('Erro ao publicar: ' + (err.message || 'Tente novamente'))
        } finally {
            setSaving(false)
        }
    }

    // Sem window.confirm() aqui: dentro do app nativo (Capacitor) esse
    // diálogo do navegador pode nem aparecer — usa o diálogo próprio abaixo.
    const handleDelete = async (id: string) => {
        setDeletingId(id)
        try {
            const { data, error } = await supabase.from('products').delete().eq('id', id).select('id')
            if (error) {
                console.error('[ProfileServiceListing] Erro ao deletar:', error)
                toast.error('Erro ao remover: ' + error.message)
                return
            }
            if (!data || data.length === 0) {
                toast.error('Não foi possível remover esse serviço (sem permissão ou ele já não existe mais).')
                return
            }
            setListings(prev => prev.filter(l => l.id !== id))
            toast.success('Serviço removido')
        } finally {
            setDeletingId(null)
            setConfirmDeleteId(null)
        }
    }

    const getImageUrl = (path: string | null) => {
        if (!path) return null
        if (path.startsWith('http')) return path
        return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
    }

    const serviceLabel = (type: string | null) => SERVICE_TYPES.find(t => t.id === type)?.label || 'Outro'

    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary

    return (
        <div className="mb-6 mt-4">
            <div
                className="rounded-2xl p-6 pt-7 flex flex-col gap-5 relative"
                style={{
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1px solid ${colors.border}`,
                    boxShadow: colors.shadow,
                }}
            >
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-between text-left"
                    style={{ padding: '0.5rem 0.75rem', borderRadius: '9999px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#ffffff' }}>
                            <Wrench size={22} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black" style={{ color: textPrimary }}>Meus serviços publicados</h3>
                            <p className="text-xs mt-0.5" style={{ color: textSecondary }}>Anuncie o serviço que você presta</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {listings.length > 0 && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#f9731620', color: '#f97316' }}>
                                {listings.length}
                            </span>
                        )}
                        {isExpanded ? <ChevronUp size={22} style={{ color: textSecondary }} /> : <ChevronDown size={22} style={{ color: textSecondary }} />}
                    </div>
                </button>

                {isExpanded && (
                    <div className="flex flex-col gap-5">
                        <button
                            onClick={() => router.push('/solicitar-servico')}
                            style={{ ...pillButtonStyle, width: '100%', padding: '0.625rem', background: `${colors.border}30`, color: colors.accent, border: `1px solid ${colors.border}` }}
                            className="hover:opacity-80 transition-opacity"
                        >
                            <MapIcon size={14} />
                            Ver todos os serviços disponíveis no mapa
                        </button>

                        {loading ? (
                            <div className="flex justify-center py-8">
                                <div className="w-6 h-6 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                            </div>
                        ) : listings.length === 0 && !isCreating ? (
                            <div
                                className="rounded-2xl p-6 text-center flex flex-col items-center gap-4"
                                style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`, border: `1px dashed ${colors.border}` }}
                            >
                                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: GRADIENT, color: '#ffffff' }}>
                                    <Wrench size={28} />
                                </div>
                                <div>
                                    <p className="text-sm font-bold" style={{ color: textPrimary }}>Você ainda não publicou nenhum serviço</p>
                                    <p className="text-xs mt-1" style={{ color: textSecondary }}>Anuncie o que você faz e apareça no mapa de quem está procurando.</p>
                                </div>
                                <button
                                    onClick={() => setIsCreating(true)}
                                    style={{ ...pillButtonStyle, padding: '0.625rem 1.5rem', background: GRADIENT, color: '#ffffff', boxShadow: `0 4px 12px #f9731640` }}
                                    className="hover:scale-105 transition-transform"
                                >
                                    <Plus size={16} />
                                    Publicar serviço
                                </button>
                            </div>
                        ) : (
                            <>
                                {listings.length > 0 && (
                                    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-400">
                                        {listings.map(listing => {
                                            const imgUrl = getImageUrl(listing.image_url)
                                            return (
                                                <div
                                                    key={listing.id}
                                                    className="flex-shrink-0 w-40 rounded-2xl border p-3 flex flex-col gap-2 cursor-pointer hover:shadow-md transition-shadow relative"
                                                    style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`, borderColor: colors.border }}
                                                    onClick={() => router.push(`/${profileSlug}/${listing.slug}/editar`)}
                                                >
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(listing.id) }}
                                                        className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center hover:bg-red-500/80 transition-colors z-10"
                                                        title="Excluir serviço"
                                                    >
                                                        <Trash2 size={13} color="white" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); router.push(`/${profileSlug}/${listing.slug}/editar`) }}
                                                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center hover:bg-black/50 transition-colors z-10"
                                                        title="Editar serviço"
                                                    >
                                                        <Pencil size={13} color="white" />
                                                    </button>

                                                    <div className="w-full h-28 rounded-xl overflow-hidden bg-gray-100">
                                                        {imgUrl ? (
                                                            <img src={imgUrl} className="w-full h-full object-cover" alt={listing.name} />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center" style={{ color: textSecondary }}>
                                                                <Wrench size={28} />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-bold truncate" style={{ color: textPrimary }}>{listing.name}</p>
                                                        <p className="text-xs font-bold mt-1" style={{ color: '#f97316' }}>{serviceLabel(listing.service_type)}</p>
                                                        {listing.address && (
                                                            <div className="flex items-center gap-1 text-[10px] mt-1" style={{ color: textSecondary }}>
                                                                <MapPin size={10} className="flex-shrink-0" />
                                                                <span className="truncate">{listing.address}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}

                                {!isCreating && (
                                    <button
                                        onClick={() => setIsCreating(true)}
                                        style={{ ...pillButtonStyle, width: '100%', padding: '0.75rem', background: 'transparent', border: `1px dashed ${colors.border}`, color: '#f97316' }}
                                        className="hover:bg-white/5 transition-colors"
                                    >
                                        <Plus size={16} />
                                        Novo serviço
                                    </button>
                                )}
                            </>
                        )}

                        {isCreating && (
                            <div
                                className="rounded-2xl p-4 border space-y-4 animate-in slide-in-from-top-2 duration-200"
                                style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`, borderColor: colors.border }}
                            >
                                <h4 className="text-sm font-black flex items-center gap-2" style={{ color: textPrimary }}>
                                    <Send size={16} style={{ color: '#f97316' }} />
                                    Novo serviço
                                </h4>

                                <div className="space-y-2 flex flex-col items-center">
                                    <label className="text-[10px] font-bold uppercase" style={{ color: textSecondary }}>Foto (opcional)</label>
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-24 h-24 rounded-full bg-gradient-to-br from-orange-100 to-red-100 border-2 border-orange-200 hover:border-orange-400 flex items-center justify-center cursor-pointer overflow-hidden transition-all group"
                                    >
                                        {preview ? (
                                            <img src={preview} className="w-full h-full object-cover" alt="" />
                                        ) : (
                                            <ImageIcon className="text-orange-400 group-hover:scale-110 transition-transform" size={24} />
                                        )}
                                    </div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => { const file = e.target.files?.[0]; if (file) setImageFile(file) }}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase" style={{ color: textSecondary }}>Tipo de serviço</label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {SERVICE_TYPES.map((t) => {
                                            const Icon = t.icon
                                            const active = serviceType === t.id
                                            return (
                                                <button
                                                    key={t.id}
                                                    onClick={() => setServiceType(t.id)}
                                                    className="flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all"
                                                    style={active ? { background: GRADIENT, color: '#fff' } : { background: colors.surface, border: `1px solid ${colors.border}` }}
                                                >
                                                    <Icon size={16} style={{ color: active ? '#fff' : colors.textSecondary }} />
                                                    <span className="text-[8px] font-bold text-center leading-tight" style={{ color: active ? '#fff' : textPrimary }}>{t.label}</span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase block text-center" style={{ color: textSecondary }}>Título do anúncio</label>
                                    <input
                                        type="text"
                                        placeholder="Ex: Pintura residencial com garantia"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full px-3 py-2 rounded-full border text-sm focus:outline-none"
                                        style={{ background: colors.surface, borderColor: colors.border, color: textPrimary }}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase" style={{ color: textSecondary }}>Descrição</label>
                                    <textarea
                                        placeholder="Descreva sua experiência, o que está incluso..."
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        rows={3}
                                        className="w-full px-3 py-2 rounded-2xl border text-sm focus:outline-none resize-none"
                                        style={{ background: colors.surface, borderColor: colors.border, color: textPrimary }}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase" style={{ color: textSecondary }}>
                                        Área de atendimento <span className="font-normal">(aparece no mapa)</span>
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            placeholder="Endereço ou região"
                                            value={address}
                                            onChange={(e) => { setAddress(e.target.value); setCoords(null) }}
                                            className="flex-1 px-3 py-2 rounded-full border text-sm focus:outline-none"
                                            style={{ background: colors.surface, borderColor: colors.border, color: textPrimary }}
                                        />
                                        <button
                                            onClick={useMyLocation}
                                            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                                            style={{ background: `${colors.accent}20`, color: colors.accent }}
                                            title="Usar minha localização atual"
                                        >
                                            {locating ? <Spinner size={16} /> : <MapPinPlus size={16} />}
                                        </button>
                                    </div>
                                    {coords && (
                                        <p className="text-[10px] flex items-center gap-1" style={{ color: '#22c55e' }}>
                                            <MapPin size={10} /> Localização marcada no mapa
                                        </p>
                                    )}
                                </div>

                                <div className="flex gap-2 pt-2">
                                    <button
                                        onClick={resetForm}
                                        style={{ ...pillButtonStyle, flex: 1, background: 'transparent', border: `2px solid ${colors.border}`, color: textSecondary }}
                                        className="hover:opacity-70 transition-opacity"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleCreate}
                                        disabled={saving || !name.trim() || !serviceType}
                                        style={{ ...pillButtonStyle, flex: 1, background: GRADIENT, color: '#ffffff', opacity: saving || !name.trim() || !serviceType ? 0.5 : 1 }}
                                        className="hover:opacity-80 transition-opacity"
                                    >
                                        {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : (
                                            <>
                                                <Send size={14} />
                                                Publicar
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {confirmDeleteId && (
                <div
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
                    style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
                    onClick={() => (deletingId ? null : setConfirmDeleteId(null))}
                >
                    <div
                        className="w-full max-w-sm rounded-2xl p-6 space-y-4"
                        style={{ background: colors.background, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-base font-black" style={{ color: textPrimary }}>Deletar este serviço?</h3>
                        <p className="text-xs" style={{ color: textSecondary }}>Essa ação não pode ser desfeita.</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setConfirmDeleteId(null)}
                                disabled={!!deletingId}
                                className="flex-1 py-3 rounded-xl font-black uppercase text-[10px] tracking-wider disabled:opacity-50"
                                style={{ background: `${colors.border}30`, color: textPrimary }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleDelete(confirmDeleteId)}
                                disabled={!!deletingId}
                                className="flex-1 py-3 rounded-xl font-black uppercase text-[10px] tracking-wider flex items-center justify-center disabled:opacity-70"
                                style={{ background: '#ef4444', color: '#fff' }}
                            >
                                {deletingId ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Deletar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
