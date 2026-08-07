// src/app/(app)/[ownerSlug]/[slug]/editar-produto/page.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import Header from '@/app/Header'
import { toast } from 'sonner'
import {
    ArrowLeft,
    Save,
    Trash2,
    Image as ImageIcon,
    X,
    AlertTriangle,
    ShoppingBag,
    Megaphone,
} from 'lucide-react'

type ProductData = {
    id: string
    name: string
    slug: string
    description: string | null
    price: number
    category: string | null
    listing_type: 'sale' | 'publication'
    image_url: string | null
    type: 'physical' | 'digital' | 'service'
    price_type: 'fixed' | 'hourly'
    stock_quantity: number | null
    owner_id: string
    store_id: string | null
}

export default function EditProductPage() {
    const params = useParams()
    const router = useRouter()
    const { colors } = useTheme()
    const { bgMode, customBgUrl, profileSlug: loggedUserSlug, avatarUrl: loggedUserAvatarUrl } = useProfile()

    // Pega os parâmetros da URL
    const ownerSlug = Array.isArray(params.ownerSlug) ? params.ownerSlug[0] : params.ownerSlug
    const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [product, setProduct] = useState<ProductData | null>(null)
    const [isOwner, setIsOwner] = useState(false)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [ownerType, setOwnerType] = useState<'profile' | 'store' | null>(null)
    const [error, setError] = useState<string | null>(null)

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: 0,
        category: '',
        type: 'physical' as 'physical' | 'digital' | 'service',
        price_type: 'fixed' as 'fixed' | 'hourly',
        stock_quantity: 0,
    })

    // ========== VERIFICAR PERMISSÃO ==========
    const checkOwnership = useCallback(async () => {
        try {
            // 1. Buscar o owner (perfil ou loja)
            let ownerId: string | null = null
            let ownerTypeLocal: 'profile' | 'store' | null = null

            // Tentar como perfil
            const { data: profile } = await supabase
                .from('profiles')
                .select('id')
                .eq('profileSlug', ownerSlug)
                .maybeSingle()

            if (profile) {
                ownerId = profile.id
                ownerTypeLocal = 'profile'
            } else {
                // Tentar como loja
                const { data: store } = await supabase
                    .from('stores')
                    .select('id, owner_id')
                    .eq('storeSlug', ownerSlug)
                    .maybeSingle()

                if (store) {
                    ownerId = store.owner_id
                    ownerTypeLocal = 'store'
                }
            }

            if (!ownerId || !ownerTypeLocal) {
                setError('Perfil ou loja não encontrado')
                setLoading(false)
                return false
            }

            setOwnerType(ownerTypeLocal)

            // 2. Buscar o produto
            const ownerField = ownerTypeLocal === 'profile' ? 'owner_id' : 'store_id'
            const { data: productData, error: productError } = await supabase
                .from('products')
                .select('*')
                .eq('slug', slug)
                .eq(ownerField, ownerId)
                .maybeSingle()

            if (productError || !productData) {
                setError('Produto ou publicação não encontrado')
                setLoading(false)
                return false
            }

            setProduct(productData)

            // 3. Verificar se o usuário atual é o dono
            const { data: { user } } = await supabase.auth.getUser()
            setCurrentUserId(user?.id || null)

            // Verifica se o usuário logado é o dono do perfil/loja
            const isOwnerUser = user?.id === ownerId
            setIsOwner(isOwnerUser)

            if (!isOwnerUser) {
                setError('Você não tem permissão para editar este conteúdo')
                setLoading(false)
                return false
            }

            // 4. Preencher o formulário
            setFormData({
                name: productData.name || '',
                description: productData.description || '',
                price: productData.price || 0,
                category: productData.category || '',
                type: productData.type || 'physical',
                price_type: productData.price_type || 'fixed',
                stock_quantity: productData.stock_quantity || 0,
            })

            return true
        } catch (err: any) {
            console.error('Erro ao carregar dados:', err)
            setError(err.message || 'Erro ao carregar dados')
            return false
        } finally {
            setLoading(false)
        }
    }, [ownerSlug, slug])

    useEffect(() => {
        checkOwnership()
    }, [checkOwnership])

    // ========== SALVAR ALTERAÇÕES ==========
    const handleSave = async () => {
        if (!product || !isOwner) return

        // Validações básicas
        if (!formData.name.trim()) {
            toast.error('O nome é obrigatório')
            return
        }

        setSaving(true)
        try {
            const updates = {
                name: formData.name.trim(),
                description: formData.description.trim() || null,
                price: formData.price || 0,
                category: formData.category.trim() || null,
                type: formData.type,
                price_type: formData.price_type,
                stock_quantity: formData.stock_quantity || null,
                updated_at: new Date().toISOString(),
            }

            const { error: updateError } = await supabase
                .from('products')
                .update(updates)
                .eq('id', product.id)

            if (updateError) throw updateError

            toast.success('Atualizado com sucesso!')

            // Redireciona para a página do produto
            router.push(`/${ownerSlug}/${slug}`)
        } catch (err: any) {
            console.error('Erro ao salvar:', err)
            toast.error('Erro ao salvar: ' + (err.message || 'Tente novamente'))
        } finally {
            setSaving(false)
        }
    }

    // ========== DELETAR ==========
    const handleDelete = async () => {
        if (!product || !isOwner) return

        const confirmMessage = product.listing_type === 'sale'
            ? 'Tem certeza que deseja excluir este produto?'
            : 'Tem certeza que deseja excluir esta publicação?'

        if (!confirm(confirmMessage)) return

        setDeleting(true)
        try {
            // Se tiver imagem, deletar do storage
            if (product.image_url) {
                const fileName = product.image_url.split('/').pop()
                if (fileName) {
                    await supabase.storage
                        .from('product-images')
                        .remove([fileName])
                }
            }

            const { error: deleteError } = await supabase
                .from('products')
                .delete()
                .eq('id', product.id)

            if (deleteError) throw deleteError

            toast.success('Removido com sucesso!')
            router.push(`/${ownerSlug}`)
        } catch (err: any) {
            console.error('Erro ao deletar:', err)
            toast.error('Erro ao deletar: ' + (err.message || 'Tente novamente'))
        } finally {
            setDeleting(false)
        }
    }

    // ========== RENDER ==========
    if (loading) {
        return <LoadingSpinner message="Carregando dados..." background={colors.background} />
    }

    if (error || !product || !isOwner) {
        return (
            <div className="min-h-screen relative" style={{ background: colors.background }}>
                <div className="fixed inset-0 z-0">
                    <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
                </div>
                <div className="relative z-10 flex items-center justify-center min-h-screen px-4">
                    <div className="max-w-md w-full rounded-3xl p-8 text-center" style={{
                        background: `rgba(255, 255, 255, 0.06)`,
                        backdropFilter: 'blur(20px)',
                        border: `1px solid rgba(255,255,255,0.12)`,
                    }}>
                        <AlertTriangle className="w-16 h-16 mx-auto mb-4" style={{ color: colors.accent }} />
                        <h2 className="text-2xl font-black mb-2" style={{ color: colors.textPrimary }}>
                            {error || 'Acesso negado'}
                        </h2>
                        <p className="text-sm mb-6" style={{ color: colors.textSecondary }}>
                            {error || 'Você não tem permissão para editar este conteúdo.'}
                        </p>
                        <button
                            onClick={() => router.push('/')}
                            className="px-6 py-3 rounded-xl font-bold transition hover:scale-105"
                            style={{ background: colors.accent, color: '#fff' }}
                        >
                            Voltar ao início
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    const isProduct = product.listing_type === 'sale'
    const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

    return (
        <div className="min-h-screen relative" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <div className="relative z-10">
                <Header
                    title="iUser"
                    showBack={false}
                    greeting="Editar"
                    avatarUrl={loggedUserAvatarUrl || null}
                    loading={loading}
                    tabs={[]}
                    showSearch={false}
                    searchPlaceholder="Buscar..."
                    onSearch={() => { }}
                    profileSlug={loggedUserSlug}
                />

                <div className="max-w-2xl mx-auto px-4 py-6 pb-32">
                    {/* Header da página */}
                    <div className="flex items-center gap-3 mb-6">
                        <button
                            onClick={() => router.back()}
                            className="p-2 rounded-full hover:bg-white/10 transition"
                            style={{ color: colors.textPrimary }}
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="flex-1">
                            <h1 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                                Editar {isProduct ? 'Produto' : 'Publicação'}
                            </h1>
                            <p className="text-xs" style={{ color: colors.textSecondary }}>
                                {isProduct ? 'Atualize as informações do seu produto' : 'Atualize as informações da sua publicação'}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase flex items-center gap-1" style={{
                                background: isProduct ? '#f9731622' : '#22c55e22',
                                color: isProduct ? '#f97316' : '#22c55e'
                            }}>
                                {isProduct ? <ShoppingBag className="w-3 h-3" /> : <Megaphone className="w-3 h-3" />}
                                {isProduct ? 'Produto' : 'Publicação'}
                            </span>
                        </div>
                    </div>

                    {/* Formulário */}
                    <div className="rounded-3xl p-6 space-y-6" style={{
                        background: `rgba(255, 255, 255, 0.06)`,
                        backdropFilter: 'blur(20px)',
                        border: `1px solid rgba(255,255,255,0.12)`,
                    }}>
                        {/* Nome */}
                        <div>
                            <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: colors.textSecondary }}>
                                Nome *
                            </label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Digite o nome do produto"
                                className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 transition"
                                style={{
                                    background: `rgba(255,255,255,0.05)`,
                                    borderColor: `rgba(255,255,255,0.1)`,
                                    color: colors.textPrimary,
                                }}
                            />
                        </div>

                        {/* Descrição */}
                        <div>
                            <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: colors.textSecondary }}>
                                Descrição
                            </label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Descreva seu produto ou serviço"
                                rows={5}
                                className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 transition resize-none"
                                style={{
                                    background: `rgba(255,255,255,0.05)`,
                                    borderColor: `rgba(255,255,255,0.1)`,
                                    color: colors.textPrimary,
                                }}
                            />
                            <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                                {formData.description.length}/1000 caracteres
                            </p>
                        </div>

                        {/* Preço (apenas para produtos) */}
                        {isProduct && (
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: colors.textSecondary }}>
                                    Preço (R$)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={formData.price}
                                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                                    placeholder="0.00"
                                    className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 transition"
                                    style={{
                                        background: `rgba(255,255,255,0.05)`,
                                        borderColor: `rgba(255,255,255,0.1)`,
                                        color: colors.textPrimary,
                                    }}
                                />
                            </div>
                        )}

                        {/* Categoria */}
                        <div>
                            <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: colors.textSecondary }}>
                                Categoria
                            </label>
                            <input
                                type="text"
                                value={formData.category}
                                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                placeholder="Ex: Eletrônicos, Moda, Serviços..."
                                className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 transition"
                                style={{
                                    background: `rgba(255,255,255,0.05)`,
                                    borderColor: `rgba(255,255,255,0.1)`,
                                    color: colors.textPrimary,
                                }}
                            />
                        </div>

                        {/* Tipo de produto (apenas para produtos) */}
                        {isProduct && (
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: colors.textSecondary }}>
                                    Tipo de Produto
                                </label>
                                <div className="flex gap-2">
                                    {['physical', 'digital', 'service'].map((type) => (
                                        <button
                                            key={type}
                                            onClick={() => setFormData({ ...formData, type: type as any })}
                                            className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase transition ${formData.type === type ? 'shadow-lg' : 'opacity-60 hover:opacity-100'
                                                }`}
                                            style={formData.type === type ? {
                                                background: GRADIENT,
                                                color: '#fff'
                                            } : {
                                                background: `rgba(255,255,255,0.05)`,
                                                color: colors.textSecondary,
                                            }}
                                        >
                                            {type === 'physical' ? 'Físico' : type === 'digital' ? 'Digital' : 'Serviço'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Tipo de preço (apenas para produtos) */}
                        {isProduct && (
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: colors.textSecondary }}>
                                    Tipo de Preço
                                </label>
                                <div className="flex gap-2">
                                    {['fixed', 'hourly'].map((type) => (
                                        <button
                                            key={type}
                                            onClick={() => setFormData({ ...formData, price_type: type as any })}
                                            className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase transition ${formData.price_type === type ? 'shadow-lg' : 'opacity-60 hover:opacity-100'
                                                }`}
                                            style={formData.price_type === type ? {
                                                background: GRADIENT,
                                                color: '#fff'
                                            } : {
                                                background: `rgba(255,255,255,0.05)`,
                                                color: colors.textSecondary,
                                            }}
                                        >
                                            {type === 'fixed' ? 'Preço Fixo' : 'Por Hora'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Estoque (apenas para produtos físicos) */}
                        {isProduct && formData.type === 'physical' && (
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: colors.textSecondary }}>
                                    Quantidade em Estoque
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={formData.stock_quantity}
                                    onChange={(e) => setFormData({ ...formData, stock_quantity: parseInt(e.target.value) || 0 })}
                                    placeholder="0"
                                    className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 transition"
                                    style={{
                                        background: `rgba(255,255,255,0.05)`,
                                        borderColor: `rgba(255,255,255,0.1)`,
                                        color: colors.textPrimary,
                                    }}
                                />
                            </div>
                        )}

                        {/* Imagem atual (se houver) */}
                        {product.image_url && (
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: colors.textSecondary }}>
                                    Imagem Atual
                                </label>
                                <div className="relative w-32 h-32 rounded-xl overflow-hidden border" style={{
                                    borderColor: `rgba(255,255,255,0.1)`,
                                }}>
                                    <img
                                        src={product.image_url}
                                        alt={product.name}
                                        className="w-full h-full object-cover"
                                    />
                                    <button
                                        onClick={async () => {
                                            if (!confirm('Remover esta imagem?')) return
                                            // Lógica para remover imagem
                                            const { error } = await supabase
                                                .from('products')
                                                .update({ image_url: null })
                                                .eq('id', product.id)
                                            if (!error) {
                                                setProduct({ ...product, image_url: null })
                                                toast.success('Imagem removida')
                                            }
                                        }}
                                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 hover:bg-black/70 transition"
                                    >
                                        <X className="w-4 h-4 text-white" />
                                    </button>
                                </div>
                                <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                                    Clique no X para remover a imagem
                                </p>
                            </div>
                        )}

                        {/* Botões de ação */}
                        <div className="flex gap-3 pt-4 border-t" style={{ borderColor: `rgba(255,255,255,0.06)` }}>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="flex-1 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                                style={{ background: GRADIENT, color: '#fff' }}
                            >
                                <Save className="w-4 h-4" />
                                {saving ? 'Salvando...' : 'Salvar alterações'}
                            </button>
                            <button
                                onClick={() => router.push(`/${ownerSlug}/${slug}`)}
                                className="px-6 py-3.5 rounded-xl font-bold transition hover:bg-white/5"
                                style={{
                                    border: `1px solid rgba(255,255,255,0.1)`,
                                    color: colors.textSecondary
                                }}
                            >
                                Cancelar
                            </button>
                        </div>

                        {/* Botão de deletar */}
                        <div className="pt-2">
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                className="w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition hover:scale-[0.98] disabled:opacity-50"
                                style={{
                                    background: '#ef444420',
                                    color: '#ef4444',
                                    border: `1px solid #ef444440`,
                                }}
                            >
                                <Trash2 className="w-4 h-4" />
                                {deleting ? 'Deletando...' : `Deletar ${isProduct ? 'produto' : 'publicação'}`}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}