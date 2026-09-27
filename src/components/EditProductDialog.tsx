// src/components/EditProductDialog.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { X, Save, ImageIcon, Trash2, MapPin } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import CategorySuggestions from '@/components/StoreDashboard/CategorySuggestions'
import ProductAddonsManager from '@/components/StoreDashboard/ProductAddonsManager'
import LocationPicker from '@/components/LocationPicker'
import { generateUniqueGlobalSlug } from '@/lib/slugUtils'

interface EditProductDialogProps {
    productId: string
    colors: any
    onClose: () => void
    onSaved: (updated: any) => void
    onDeleted: (id: string) => void
}

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// Diálogo de edição de produto/serviço/publicação — a mesma lógica que
// antes vivia numa página própria (/[ownerSlug]/[slug]/editar), só que
// como modal: quem já está numa lista de produtos (Store.tsx, dashboards)
// não perde o lugar ao editar. Busca o registro fresco pelo id (não usa o
// que já está na lista, porque lá o image_url já foi resolvido pra URL
// pública e salvar isso de volta quebraria o campo no banco).
export default function EditProductDialog({ productId, colors, onClose, onSaved, onDeleted }: EditProductDialogProps) {
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

    const resolveImageUrl = (path: string) => {
        if (path.startsWith('http')) return path
        return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
    }

    const fileInputRef = useRef<HTMLInputElement>(null)
    const [loading, setLoading] = useState(false)
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [imagePreview, setImagePreview] = useState<string | null>(null)
    const [currentImagePath, setCurrentImagePath] = useState<string | null>(null)

    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [price, setPrice] = useState('')
    const [category, setCategory] = useState('')
    const [productType, setProductType] = useState('physical')
    const [priceType, setPriceType] = useState('fixed')
    const [durationMinutes, setDurationMinutes] = useState('')
    const [stockQuantity, setStockQuantity] = useState('')
    const [isActive, setIsActive] = useState(true)
    const [hasAddons, setHasAddons] = useState(false)
    const [deleting, setDeleting] = useState(false)

    // Localização (só relevante pra serviços avulsos publicados por uma
    // pessoa — serviço de loja usa o endereço da própria loja).
    const [address, setAddress] = useState<string | null>(null)
    const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
    const [showLocationPicker, setShowLocationPicker] = useState(false)

    useEffect(() => {
        if (!product) return
        setImagePreview(product.image_url ? resolveImageUrl(product.image_url) : null)
        setCurrentImagePath(product.image_url || null)
        setName(product.name || '')
        setDescription(product.description || '')
        setPrice(product.price?.toString() || '')
        setCategory(product.category || '')
        setProductType(product.type || 'physical')
        setPriceType(product.price_type || 'fixed')
        setDurationMinutes(product.duration_minutes?.toString() || '')
        setStockQuantity(product.stock_quantity?.toString() || '')
        setIsActive(product.is_active !== false)
        setHasAddons(product.has_addons === true)
        setAddress(product.address || null)
        setCoords(product.lat != null && product.lng != null ? { lat: product.lat, lng: product.lng } : null)
    }, [product])

    useEffect(() => {
        if (!imageFile) return
        const url = URL.createObjectURL(imageFile)
        setImagePreview(url)
        return () => URL.revokeObjectURL(url)
    }, [imageFile])

    const isServiceOffer = product?.listing_type === 'service_offer'
    const isPublication = product?.listing_type === 'publication'

    const handleSave = async () => {
        if (!name.trim()) {
            toast.error('Nome é obrigatório')
            return
        }
        if (!product) return

        setLoading(true)
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

            const updateData: Record<string, any> = {
                name: name.trim(),
                slug,
                description: description.trim() || null,
                image_url: imagePath,
            }

            if (!isPublication) {
                updateData.price = price ? parseFloat(price) : 0
                updateData.category = category.trim() || null
                updateData.type = productType
                updateData.price_type = priceType
                updateData.duration_minutes = durationMinutes ? parseInt(durationMinutes) : null
                updateData.is_active = isActive
                updateData.has_addons = hasAddons
            }

            if (isServiceOffer) {
                updateData.address = address
                updateData.lat = coords?.lat ?? null
                updateData.lng = coords?.lng ?? null
            }

            const stockPayload: Record<string, number | null> = {}
            if (!isPublication) {
                if (stockQuantity.trim() !== '') stockPayload.stock_quantity = parseInt(stockQuantity)
                else if (product.stock_quantity != null) stockPayload.stock_quantity = null
            }

            const { data: updated, error: updateError } = await supabase
                .from('products')
                .update({ ...updateData, ...stockPayload })
                .eq('id', product.id)
                .select('*')
                .single()

            if (updateError) throw updateError

            toast.success(isPublication ? 'Publicação atualizada!' : 'Produto atualizado!')
            onSaved({
                ...updated,
                image_url: updated.image_url ? resolveImageUrl(updated.image_url) : null,
            })
        } catch (err: any) {
            console.error('Erro ao salvar:', err)
            toast.error('Erro ao salvar: ' + (err.message || 'Tente novamente'))
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        if (!product) return
        if (!confirm(`Tem certeza que deseja excluir ${isPublication ? 'esta publicação' : 'este produto'}? Esta ação não pode ser desfeita.`)) return

        setDeleting(true)
        try {
            if (currentImagePath) {
                await supabase.storage.from('product-images').remove([currentImagePath])
            }
            const { error } = await supabase.from('products').delete().eq('id', product.id)
            if (error) throw error

            toast.success(isPublication ? 'Publicação excluída' : 'Produto excluído')
            onDeleted(product.id)
        } catch (err: any) {
            console.error('Erro ao deletar:', err)
            toast.error('Erro ao deletar: ' + (err.message || 'Tente novamente'))
        } finally {
            setDeleting(false)
        }
    }

    const inputStyle = {
        background: colors.surface,
        borderColor: colors.border,
        color: colors.textPrimary,
        '--tw-ring-color': '#f97316',
    } as React.CSSProperties

    return (
        <div
            className="fixed inset-0 z-[500] bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-lg rounded-2xl p-6 animate-fade-in max-h-[90vh] overflow-y-auto"
                style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                        {isPublication ? 'Editar Publicação' : 'Editar Produto'}
                    </h3>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-black/5 transition" style={{ color: colors.textSecondary }}>
                        <X size={20} />
                    </button>
                </div>

                {loadingProduct || !product ? (
                    <div className="flex items-center justify-center py-16">
                        <Spinner size={32} color="#f97316" />
                    </div>
                ) : (
                    <div className="space-y-5">
                        {/* Imagem */}
                        <div className="space-y-2">
                            <label className="text-sm font-bold" style={{ color: colors.textPrimary }}>Imagem</label>
                            <div className="flex items-center gap-4">
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-24 h-24 rounded-xl overflow-hidden cursor-pointer border-2 border-dashed flex items-center justify-center transition-all hover:border-orange-400"
                                    style={{ borderColor: colors.border, background: colors.background }}
                                >
                                    {imagePreview ? (
                                        <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                    ) : (
                                        <ImageIcon size={26} style={{ color: colors.textSecondary }} />
                                    )}
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => { const file = e.target.files?.[0]; if (file) setImageFile(file) }}
                                />
                                {imagePreview && (
                                    <button
                                        onClick={() => { setImageFile(null); setImagePreview(null); setCurrentImagePath(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                                        className="p-2 rounded-lg hover:bg-red-500/10 transition-colors"
                                        style={{ color: '#ef4444' }}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Nome */}
                        <div className="space-y-2">
                            <label className="text-sm font-bold" style={{ color: colors.textPrimary }}>Nome *</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 transition-all"
                                style={inputStyle}
                            />
                        </div>

                        {/* Descrição */}
                        <div className="space-y-2">
                            <label className="text-sm font-bold" style={{ color: colors.textPrimary }}>Descrição</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={3}
                                className="w-full px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 transition-all resize-none"
                                style={inputStyle}
                            />
                        </div>

                        {!isPublication && (
                            <>
                                {/* Preço */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold" style={{ color: colors.textPrimary }}>Preço (R$)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={price}
                                            onChange={(e) => setPrice(e.target.value)}
                                            className="w-full px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 transition-all"
                                            style={inputStyle}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold" style={{ color: colors.textPrimary }}>Tipo de Preço</label>
                                        <select
                                            value={priceType}
                                            onChange={(e) => setPriceType(e.target.value)}
                                            className="w-full px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 transition-all"
                                            style={inputStyle}
                                        >
                                            <option value="fixed">Fixo</option>
                                            <option value="hourly">Por Hora</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Categoria e Tipo */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold" style={{ color: colors.textPrimary }}>Categoria</label>
                                        <input
                                            type="text"
                                            value={category}
                                            onChange={(e) => setCategory(e.target.value)}
                                            className="w-full px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 transition-all"
                                            style={inputStyle}
                                        />
                                        <CategorySuggestions storeId={product.store_id} value={category} onPick={setCategory} colors={colors} />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold" style={{ color: colors.textPrimary }}>Tipo</label>
                                        <select
                                            value={productType}
                                            onChange={(e) => setProductType(e.target.value)}
                                            className="w-full px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 transition-all"
                                            style={inputStyle}
                                        >
                                            <option value="physical">Físico</option>
                                            <option value="service">Serviço</option>
                                            <option value="digital">Digital</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Duração e Estoque */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold" style={{ color: colors.textPrimary }}>Duração (min)</label>
                                        <input
                                            type="number"
                                            value={durationMinutes}
                                            onChange={(e) => setDurationMinutes(e.target.value)}
                                            className="w-full px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 transition-all"
                                            style={inputStyle}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold" style={{ color: colors.textPrimary }}>Estoque</label>
                                        <input
                                            type="number"
                                            value={stockQuantity}
                                            onChange={(e) => setStockQuantity(e.target.value)}
                                            placeholder="Sem controle"
                                            className="w-full px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 transition-all"
                                            style={inputStyle}
                                        />
                                    </div>
                                </div>

                                {/* Localização (só serviço avulso de perfil) */}
                                {isServiceOffer && (
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold" style={{ color: colors.textPrimary }}>Local do atendimento</label>
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
                                )}

                                {/* Ativo */}
                                <div className="flex items-center gap-3">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="sr-only peer" />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                                    </label>
                                    <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>Ativo</span>
                                </div>

                                {/* Adicionais */}
                                <div className="space-y-3 pt-2 border-t" style={{ borderColor: colors.border }}>
                                    <div className="flex items-center gap-3">
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" checked={hasAddons} onChange={(e) => setHasAddons(e.target.checked)} className="sr-only peer" />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                                        </label>
                                        <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>Oferecer adicionais?</span>
                                    </div>
                                    {hasAddons && (
                                        <ProductAddonsManager productId={product.id} storeId={product.store_id} colors={colors} />
                                    )}
                                </div>
                            </>
                        )}

                        {/* Ações */}
                        <div className="flex gap-2 pt-3 border-t" style={{ borderColor: colors.border }}>
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                className="px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all hover:scale-105 disabled:opacity-50"
                                style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
                            >
                                {deleting ? <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : <Trash2 size={16} />}
                                Excluir
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={loading}
                                className="flex-1 px-6 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50"
                                style={{ background: GRADIENT, color: '#ffffff', boxShadow: '0 4px 14px #f9731660' }}
                            >
                                {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={16} />}
                                Salvar
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {showLocationPicker && typeof document !== 'undefined' && createPortal(
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
        </div>
    )
}
