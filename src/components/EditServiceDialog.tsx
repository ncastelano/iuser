// src/components/EditServiceDialog.tsx
//
// Diálogo de edição de um serviço publicado por um perfil (products.listing_type =
// 'service_offer') — o mesmo formato de modal do EditProductDialog (usado nos
// serviços das lojas), só que com os campos de serviço: foto, nome, tipo de
// serviço, descrição, onde atende e ativo. Sem preço, estoque nem adicionais.
'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { X, Save, ImageIcon, Trash2, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { Spinner } from '@/components/Spinner'
import LocationPicker from '@/components/LocationPicker'
import { generateUniqueGlobalSlug } from '@/lib/slugUtils'
import { SERVICE_TYPES, type ServiceType } from '@/lib/serviceTypes'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface EditServiceDialogProps {
    productId: string
    colors: any
    onClose: () => void
    onSaved: (updated: any) => void
    onDeleted: (id: string) => void
}

export default function EditServiceDialog({ productId, colors, onClose, onSaved, onDeleted }: EditServiceDialogProps) {
    const [loadingProduct, setLoadingProduct] = useState(true)
    const [product, setProduct] = useState<any | null>(null)

    useEffect(() => {
        let isMounted = true
        supabase.from('products').select('*').eq('id', productId).maybeSingle().then(({ data }) => {
            if (!isMounted) return
            setProduct(data)
            setLoadingProduct(false)
        })
        return () => { isMounted = false }
    }, [productId])

    const resolveImageUrl = (path: string) =>
        path.startsWith('http') ? path : supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl

    const fileInputRef = useRef<HTMLInputElement>(null)
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [imagePreview, setImagePreview] = useState<string | null>(null)
    const [currentImagePath, setCurrentImagePath] = useState<string | null>(null)

    const [name, setName] = useState('')
    const [serviceType, setServiceType] = useState<ServiceType | ''>('')
    const [description, setDescription] = useState('')
    const [isActive, setIsActive] = useState(true)
    const [address, setAddress] = useState<string | null>(null)
    const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
    const [showLocationPicker, setShowLocationPicker] = useState(false)

    useEffect(() => {
        if (!product) return
        setImagePreview(product.image_url ? resolveImageUrl(product.image_url) : null)
        setCurrentImagePath(product.image_url || null)
        setName(product.name || '')
        setServiceType((product.service_type as ServiceType) || '')
        setDescription(product.description || '')
        setIsActive(product.is_active !== false)
        setAddress(product.address || null)
        setCoords(product.lat != null && product.lng != null ? { lat: product.lat, lng: product.lng } : null)
    }, [product])

    useEffect(() => {
        if (!imageFile) return
        const url = URL.createObjectURL(imageFile)
        setImagePreview(url)
        return () => URL.revokeObjectURL(url)
    }, [imageFile])

    const handleSave = async () => {
        if (!product) return
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
            let imagePath = currentImagePath
            if (imageFile) {
                const fileExt = imageFile.name.split('.').pop()
                const fileName = `${Date.now()}.${fileExt}`
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('product-images')
                    .upload(fileName, imageFile, { upsert: true })
                if (uploadError) throw uploadError
                imagePath = uploadData?.path ?? null
            }

            let slug = product.slug
            if (name.trim() !== product.name) {
                slug = await generateUniqueGlobalSlug(name, { excludeProductId: product.id })
            }

            const { data: updated, error } = await supabase
                .from('products')
                .update({
                    name: name.trim(),
                    slug,
                    description: description.trim() || null,
                    service_type: serviceType,
                    image_url: imagePath,
                    is_active: isActive,
                    address,
                    lat: coords?.lat ?? null,
                    lng: coords?.lng ?? null,
                })
                .eq('id', product.id)
                .select('*')
                .single()
            if (error) throw error

            toast.success('Serviço atualizado!')
            onSaved({ ...updated, image_url: updated.image_url ? resolveImageUrl(updated.image_url) : null })
        } catch (err: any) {
            console.error('Erro ao salvar serviço:', err)
            toast.error('Erro ao salvar: ' + (err.message || 'tente novamente'))
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!product) return
        setDeleting(true)
        try {
            if (currentImagePath) {
                await supabase.storage.from('product-images').remove([currentImagePath])
            }
            const { data, error } = await supabase.from('products').delete().eq('id', product.id).select('id')
            if (error) throw error
            if (!data || data.length === 0) {
                toast.error('Não foi possível excluir esse serviço (sem permissão ou ele já não existe mais).')
                return
            }
            toast.success('Serviço excluído')
            onDeleted(product.id)
        } catch (err: any) {
            toast.error('Erro ao excluir: ' + (err.message || 'tente novamente'))
        } finally {
            setDeleting(false)
        }
    }

    const inputStyle = { background: colors.surface, borderColor: colors.border, color: colors.textPrimary } as React.CSSProperties
    const label = (text: string) => <label className="text-sm font-bold block" style={{ color: colors.textPrimary }}>{text}</label>

    return createPortal(
        <div className="fixed inset-0 z-[500] bg-black/60 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="w-full max-w-lg rounded-2xl p-6 animate-fade-in max-h-[90vh] overflow-y-auto"
                style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>Editar Serviço</h3>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-black/5 transition" style={{ color: colors.textSecondary }} aria-label="Fechar">
                        <X size={20} />
                    </button>
                </div>

                {loadingProduct || !product ? (
                    <div className="flex items-center justify-center py-16">
                        <Spinner size={32} color="#f97316" />
                    </div>
                ) : (
                    <div className="space-y-5">
                        {/* Foto */}
                        <div className="space-y-2">
                            {label('Foto do serviço')}
                            <div className="flex items-center gap-4">
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-28 h-28 rounded-xl overflow-hidden cursor-pointer border-2 border-dashed flex items-center justify-center"
                                    style={{ borderColor: colors.border, background: colors.background }}
                                >
                                    {imagePreview ? (
                                        <img src={imagePreview} alt="Foto do serviço" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="text-center">
                                            <ImageIcon size={28} style={{ color: colors.textSecondary }} />
                                            <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Adicionar</p>
                                        </div>
                                    )}
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (file) setImageFile(file)
                                    }}
                                />
                                {imagePreview && (
                                    <button
                                        onClick={() => {
                                            setImageFile(null)
                                            setImagePreview(null)
                                            setCurrentImagePath(null)
                                            if (fileInputRef.current) fileInputRef.current.value = ''
                                        }}
                                        className="p-2 rounded-lg"
                                        style={{ color: '#ef4444' }}
                                        aria-label="Remover foto"
                                    >
                                        <Trash2 size={20} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Nome */}
                        <div className="space-y-2">
                            {label('Nome do serviço *')}
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ex: Instalação elétrica residencial"
                                className="w-full px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2"
                                style={inputStyle}
                            />
                        </div>

                        {/* Tipo de serviço */}
                        <div className="space-y-2">
                            {label('Tipo de serviço *')}
                            <div className="flex flex-wrap gap-2">
                                {SERVICE_TYPES.map((t) => {
                                    const active = serviceType === t.id
                                    const Icon = t.icon
                                    return (
                                        <button
                                            key={t.id}
                                            onClick={() => setServiceType(t.id)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
                                            style={active
                                                ? { background: GRADIENT, color: '#fff' }
                                                : { background: `${colors.border}30`, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                                        >
                                            <Icon size={13} />
                                            {t.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Descrição */}
                        <div className="space-y-2">
                            {label('Sobre o serviço')}
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={4}
                                placeholder="Conte o que você faz, sua experiência, o que está incluso..."
                                className="w-full px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 resize-none"
                                style={inputStyle}
                            />
                        </div>

                        {/* Onde atende */}
                        <div className="space-y-2">
                            {label('Onde você atende')}
                            <button
                                onClick={() => setShowLocationPicker(true)}
                                className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border text-left transition-all hover:border-orange-400"
                                style={{ borderColor: colors.border, background: colors.background }}
                            >
                                <MapPin size={16} style={{ color: '#f97316', flexShrink: 0 }} />
                                <span className="text-sm truncate" style={{ color: address ? colors.textPrimary : colors.textSecondary }}>
                                    {address || 'Definir localização no mapa'}
                                </span>
                            </button>
                        </div>

                        {/* Ativo */}
                        <div className="flex items-center gap-3">
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="sr-only peer" />
                                <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                            </label>
                            <div>
                                <span className="text-sm font-bold block" style={{ color: colors.textPrimary }}>Serviço ativo</span>
                                <span className="text-xs" style={{ color: colors.textSecondary }}>Desligado, ele some do mapa, do Radar e da busca.</span>
                            </div>
                        </div>

                        {/* Ações */}
                        <div className="pt-3 border-t space-y-3" style={{ borderColor: colors.border }}>
                            {confirmDelete && (
                                <p className="text-sm" style={{ color: colors.textPrimary }}>Tem certeza? O serviço some pra todo mundo e não dá pra desfazer.</p>
                            )}
                            <div className="flex gap-2">
                                {!confirmDelete ? (
                                    <button
                                        onClick={() => setConfirmDelete(true)}
                                        className="px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all hover:scale-105"
                                        style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
                                    >
                                        <Trash2 size={16} />
                                        Excluir
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => setConfirmDelete(false)}
                                            className="px-4 py-2.5 rounded-xl font-bold text-sm"
                                            style={{ background: `${colors.border}30`, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                                        >
                                            Voltar
                                        </button>
                                        <button
                                            onClick={handleDelete}
                                            disabled={deleting}
                                            className="px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 disabled:opacity-60"
                                            style={{ background: '#ef4444', color: '#fff' }}
                                        >
                                            {deleting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                                            Confirmar exclusão
                                        </button>
                                    </>
                                )}
                                {!confirmDelete && (
                                    <button
                                        onClick={handleSave}
                                        disabled={saving}
                                        className="flex-1 px-6 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50"
                                        style={{ background: GRADIENT, color: '#fff', boxShadow: '0 4px 14px #f9731660' }}
                                    >
                                        {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={16} />}
                                        Salvar
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {showLocationPicker && createPortal(
                <LocationPicker
                    initialLocation={coords ? { lat: coords.lat, lng: coords.lng, address: address || '' } : null}
                    onSave={(loc) => {
                        setAddress(loc.address)
                        setCoords({ lat: loc.lat, lng: loc.lng })
                        setShowLocationPicker(false)
                    }}
                    onClose={() => setShowLocationPicker(false)}
                    subject="profile"
                />,
                document.body
            )}
        </div>,
        document.body
    )
}
