// src/app/(app)/[ownerSlug]/[slug]/editar/EditProductClient.tsx
'use client'

import CategorySuggestions from '@/components/StoreDashboard/CategorySuggestions'
import { useState, useRef, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { toast } from 'sonner'
import {
    ArrowLeft,
    Save,
    X,
    ImageIcon,
    Trash2,
} from 'lucide-react'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import Header from '@/components/Header'
import { Spinner } from '@/components/Spinner'
import { generateUniqueGlobalSlug } from '@/lib/slugUtils'
import ProductAddonsManager from '@/components/StoreDashboard/ProductAddonsManager'

export function EditProductClient() {
    const router = useRouter()
    const params = useParams()
    const ownerSlug = (Array.isArray(params.ownerSlug) ? params.ownerSlug[0] : params.ownerSlug) ?? ''
    const slug = (Array.isArray(params.slug) ? params.slug[0] : params.slug) ?? ''
    const { colors } = useTheme()
    const { userId, avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()

    // ===== BUSCA O PRODUTO E CONFERE SE QUEM ESTÁ LOGADO É O DONO =====
    const [loadingProduct, setLoadingProduct] = useState(true)
    const [product, setProduct] = useState<any | null>(null)
    const [authorized, setAuthorized] = useState(false)

    useEffect(() => {
        if (profileLoading || !slug || !ownerSlug) return
        let isMounted = true

        const load = async () => {
            const { data: prod } = await supabase.from('products').select('*').eq('slug', slug).maybeSingle()
            if (!isMounted) return
            if (!prod) {
                setLoadingProduct(false)
                return
            }

            // O dono pode ser um perfil (produto pessoal) ou uma loja.
            const { data: profile } = await supabase.from('profiles').select('id').eq('profileSlug', ownerSlug).maybeSingle()
            let resolvedOwnerId = profile?.id
            if (!resolvedOwnerId) {
                const { data: store } = await supabase.from('stores').select('id, owner_id').eq('storeSlug', ownerSlug).maybeSingle()
                resolvedOwnerId = store?.owner_id
            }

            if (!isMounted) return
            setProduct(prod)
            setAuthorized(!!userId && userId === resolvedOwnerId)
            setLoadingProduct(false)
        }
        load()

        return () => { isMounted = false }
    }, [slug, ownerSlug, userId, profileLoading])

    // O produto guarda só o caminho no storage: sem virar URL pública o <img> quebra.
    const resolveImageUrl = (path: string) => {
        if (path.startsWith('http')) return path
        return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
    }

    const fileInputRef = useRef<HTMLInputElement>(null)
    const [loading, setLoading] = useState(false)
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [imagePreview, setImagePreview] = useState<string | null>(null)
    const [currentImagePath, setCurrentImagePath] = useState<string | null>(null)

    // Form fields
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

    const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

    // Preenche o formulário assim que o produto chega.
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
    }, [product])

    // Preview da imagem
    useEffect(() => {
        if (!imageFile) return
        const url = URL.createObjectURL(imageFile)
        setImagePreview(url)
        return () => URL.revokeObjectURL(url)
    }, [imageFile])

    // Função para obter URL pública
    const getPublicUrl = (path: string | null) => {
        if (!path) return null
        if (path.startsWith('http')) return path
        const { data } = supabase.storage.from('product-images').getPublicUrl(path)
        return data.publicUrl
    }

    // Salvar produto
    const handleSave = async () => {
        if (!name.trim()) {
            toast.error('Nome do produto é obrigatório')
            return
        }
        if (!product) return

        setLoading(true)

        try {
            let imagePath = currentImagePath

            // Upload da nova imagem
            if (imageFile) {
                const fileExt = imageFile.name.split('.').pop()
                const fileName = `${Date.now()}.${fileExt}`
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('product-images')
                    .upload(fileName, imageFile, { upsert: true })

                if (uploadError) throw uploadError
                imagePath = uploadData?.path ?? null
            }

            // Gerar slug se o nome mudou
            let slug = product.slug
            if (name.trim() !== product.name) {
                slug = await generateUniqueGlobalSlug(name, { excludeProductId: product.id })
            }

            const updateData = {
                name: name.trim(),
                slug,
                description: description.trim() || null,
                price: price ? parseFloat(price) : 0,
                category: category.trim() || null,
                type: productType,
                price_type: priceType,
                duration_minutes: durationMinutes ? parseInt(durationMinutes) : null,
                is_active: isActive,
                has_addons: hasAddons,
                image_url: imagePath,
            }

            // Estoque é opcional: vazio = sem controle de estoque, e a coluna nem é
            // enviada (só mexe nela se a pessoa preencheu, ou pra limpar um valor antigo).
            const stockPayload: Record<string, number | null> = {}
            if (stockQuantity.trim() !== '') stockPayload.stock_quantity = parseInt(stockQuantity)
            else if (product.stock_quantity != null) stockPayload.stock_quantity = null

            const { error: updateError } = await supabase
                .from('products')
                .update({ ...updateData, ...stockPayload })
                .eq('id', product.id)

            if (updateError) throw updateError

            toast.success('Produto atualizado com sucesso!')

            // Redirecionar para a página do produto
            router.push(`/${ownerSlug}/${slug}`)

        } catch (err: any) {
            console.error('Erro ao salvar:', err)
            toast.error('Erro ao salvar: ' + (err.message || 'Tente novamente'))
        } finally {
            setLoading(false)
        }
    }

    // Deletar produto
    const handleDelete = async () => {
        if (!product) return
        if (!confirm('Tem certeza que deseja excluir este produto? Esta ação não pode ser desfeita.')) return

        setDeleting(true)
        try {
            // Deletar imagem se existir
            if (currentImagePath) {
                await supabase.storage
                    .from('product-images')
                    .remove([currentImagePath])
            }

            const { error } = await supabase
                .from('products')
                .delete()
                .eq('id', product.id)

            if (error) throw error

            toast.success('Produto excluído com sucesso!')
            router.push(`/${ownerSlug}`)
        } catch (err: any) {
            console.error('Erro ao deletar:', err)
            toast.error('Erro ao deletar: ' + (err.message || 'Tente novamente'))
        } finally {
            setDeleting(false)
        }
    }

    if (profileLoading || loadingProduct) {
        return (
            <div className="min-h-dvh flex items-center justify-center" style={{ background: colors.background }}>
                <Spinner size={32} color={colors.accent} />
            </div>
        )
    }

    if (!product || !authorized) {
        return (
            <div className="min-h-dvh flex items-center justify-center px-4" style={{ background: colors.background }}>
                <div className="text-center">
                    <h1 className="text-xl font-black" style={{ color: '#ef4444' }}>Produto não encontrado ou não autorizado</h1>
                    <p className="text-sm mt-2" style={{ color: colors.textSecondary }}>
                        Você não tem permissão para editar este produto.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh pb-28">
                <Header
                    title="Editar Produto"
                    showBack={true}
                    onBack={() => router.back()}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl || null}
                    loading={profileLoading}
                />

                <div className="w-full px-4 md:px-6 py-6">
                    <div className="rounded-2xl p-6" style={{
                        background: `rgba(255, 255, 255, 0.05)`,
                        backdropFilter: 'blur(12px)',
                        border: `1px solid ${colors.border}`
                    }}>
                        {/* Cabeçalho */}
                        <div className="flex items-center justify-between mb-6">
                            <h1 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                                {product.listing_type === 'publication' ? 'Editar Publicação' : 'Editar Produto'}
                            </h1>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => router.back()}
                                    className="px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all hover:scale-105"
                                    style={{
                                        background: 'rgba(255,255,255,0.1)',
                                        color: colors.textSecondary,
                                        border: `1px solid ${colors.border}`
                                    }}
                                >
                                    <ArrowLeft size={16} />
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={loading}
                                    className="px-6 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all hover:scale-105 disabled:opacity-50"
                                    style={{
                                        background: GRADIENT,
                                        color: '#ffffff',
                                        boxShadow: `0 4px 14px #f9731660`
                                    }}
                                >
                                    {loading ? (
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <Save size={16} />
                                    )}
                                    Salvar
                                </button>
                            </div>
                        </div>

                        {/* Formulário */}
                        <div className="space-y-6">
                            {/* Imagem */}
                            <div className="space-y-2">
                                <label className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                    Imagem
                                </label>
                                <div className="flex items-center gap-4">
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-32 h-32 rounded-xl overflow-hidden cursor-pointer border-2 border-dashed flex items-center justify-center transition-all hover:border-orange-400"
                                        style={{
                                            borderColor: colors.border,
                                            background: colors.surface
                                        }}
                                    >
                                        {imagePreview ? (
                                            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="text-center">
                                                <ImageIcon size={32} style={{ color: colors.textSecondary }} />
                                                <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                                                    Adicionar
                                                </p>
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
                                            className="p-2 rounded-lg hover:bg-red-50 transition-colors"
                                            style={{ color: '#ef4444' }}
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                    )}
                                </div>
                                <p className="text-xs" style={{ color: colors.textSecondary }}>
                                    Clique na imagem para fazer upload
                                </p>
                            </div>

                            {/* Nome */}
                            <div className="space-y-2">
                                <label className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                    Nome *
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Digite o nome do produto"
                                    className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 transition-all"
                                    style={{
                                        background: colors.surface,
                                        borderColor: colors.border,
                                        color: colors.textPrimary,
                                        '--tw-ring-color': '#f97316',
                                    } as React.CSSProperties}
                                />
                            </div>

                            {/* Descrição */}
                            <div className="space-y-2">
                                <label className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                    Descrição
                                </label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Descreva seu produto..."
                                    rows={4}
                                    className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 transition-all resize-none"
                                    style={{
                                        background: colors.surface,
                                        borderColor: colors.border,
                                        color: colors.textPrimary,
                                        '--tw-ring-color': '#f97316',
                                    } as React.CSSProperties}
                                />
                            </div>

                            {/* Preço */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                        Preço (R$)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={price}
                                        onChange={(e) => setPrice(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 transition-all"
                                        style={{
                                            background: colors.surface,
                                            borderColor: colors.border,
                                            color: colors.textPrimary,
                                            '--tw-ring-color': '#f97316',
                                        } as React.CSSProperties}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                        Tipo de Preço
                                    </label>
                                    <select
                                        value={priceType}
                                        onChange={(e) => setPriceType(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 transition-all"
                                        style={{
                                            background: colors.surface,
                                            borderColor: colors.border,
                                            color: colors.textPrimary,
                                            '--tw-ring-color': '#f97316',
                                        } as React.CSSProperties}
                                    >
                                        <option value="fixed">Fixo</option>
                                        <option value="hourly">Por Hora</option>
                                    </select>
                                </div>
                            </div>

                            {/* Categoria e Tipo */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                        Categoria
                                    </label>
                                    <input
                                        type="text"
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value)}
                                        placeholder="Ex: Alimentação"
                                        className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 transition-all"
                                        style={{
                                            background: colors.surface,
                                            borderColor: colors.border,
                                            color: colors.textPrimary,
                                            '--tw-ring-color': '#f97316',
                                        } as React.CSSProperties}
                                    />
                                    <CategorySuggestions storeId={product.store_id} value={category} onPick={setCategory} colors={colors} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                        Tipo
                                    </label>
                                    <select
                                        value={productType}
                                        onChange={(e) => setProductType(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 transition-all"
                                        style={{
                                            background: colors.surface,
                                            borderColor: colors.border,
                                            color: colors.textPrimary,
                                            '--tw-ring-color': '#f97316',
                                        } as React.CSSProperties}
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
                                    <label className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                        Duração (minutos)
                                    </label>
                                    <input
                                        type="number"
                                        value={durationMinutes}
                                        onChange={(e) => setDurationMinutes(e.target.value)}
                                        placeholder="Ex: 60"
                                        className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 transition-all"
                                        style={{
                                            background: colors.surface,
                                            borderColor: colors.border,
                                            color: colors.textPrimary,
                                            '--tw-ring-color': '#f97316',
                                        } as React.CSSProperties}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                        Estoque
                                    </label>
                                    <input
                                        type="number"
                                        value={stockQuantity}
                                        onChange={(e) => setStockQuantity(e.target.value)}
                                        placeholder="Quantidade disponível"
                                        className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 transition-all"
                                        style={{
                                            background: colors.surface,
                                            borderColor: colors.border,
                                            color: colors.textPrimary,
                                            '--tw-ring-color': '#f97316',
                                        } as React.CSSProperties}
                                    />
                                </div>
                            </div>

                            {/* Ativo */}
                            <div className="flex items-center gap-3">
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isActive}
                                        onChange={(e) => setIsActive(e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                                </label>
                                <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                    Produto ativo
                                </span>
                            </div>

                            {/* Adicionais (ingredientes extras) */}
                            <div className="space-y-3 pt-2 border-t" style={{ borderColor: colors.border }}>
                                <div className="flex items-center gap-3">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={hasAddons}
                                            onChange={(e) => setHasAddons(e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                                    </label>
                                    <div>
                                        <span className="text-sm font-bold block" style={{ color: colors.textPrimary }}>
                                            Oferecer adicional para os produtos?
                                        </span>
                                        <span className="text-xs" style={{ color: colors.textSecondary }}>
                                            Ofereça mais itens para adicionar, com o preço que você quiser. O cliente escolhe e paga a mais ao adicionar no carrinho.
                                        </span>
                                    </div>
                                </div>

                                {hasAddons && (
                                    <ProductAddonsManager productId={product.id} storeId={product.store_id} colors={colors} />
                                )}
                            </div>

                            {/* Botão de deletar */}
                            <div className="pt-4 border-t" style={{ borderColor: colors.border }}>
                                <button
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    className="px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all hover:scale-105 disabled:opacity-50"
                                    style={{
                                        background: '#ef4444',
                                        color: '#ffffff',
                                        boxShadow: `0 4px 14px #ef444460`
                                    }}
                                >
                                    {deleting ? (
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <Trash2 size={16} />
                                    )}
                                    Excluir {product.listing_type === 'publication' ? 'Publicação' : 'Produto'}
                                </button>
                                <p className="text-xs mt-2" style={{ color: colors.textSecondary }}>
                                    Esta ação não pode ser desfeita
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}