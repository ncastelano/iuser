// src/app/(main)/[ownerSlug]/criar-produto/CriarProdutoClient.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { toast } from 'sonner'
import { ArrowLeft, Save, ImageIcon, Trash2 } from 'lucide-react'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import Header from '@/components/Header'
import { Spinner } from '@/components/Spinner'
import { generateUniqueGlobalSlug } from '@/lib/slugUtils'
import { useActivePlans } from '@/hooks/useActivePlans'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export function CriarProdutoClient() {
    const router = useRouter()
    const params = useParams()
    const ownerSlug = (Array.isArray(params.ownerSlug) ? params.ownerSlug[0] : params.ownerSlug) ?? ''
    const { colors } = useTheme()
    const { userId, avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()
    const { hasStore } = useActivePlans(userId)

    // ===== RESOLVE A LOJA E CONFERE SE QUEM ESTÁ LOGADO É O DONO =====
    const [checkingStore, setCheckingStore] = useState(true)
    const [storeId, setStoreId] = useState<string | null>(null)
    const [authorized, setAuthorized] = useState(false)

    useEffect(() => {
        if (profileLoading || !ownerSlug) return
        let isMounted = true

        supabase
            .from('stores')
            .select('id, owner_id')
            .eq('storeSlug', ownerSlug)
            .maybeSingle()
            .then(({ data: store }) => {
                if (!isMounted) return
                if (store) {
                    setStoreId(store.id)
                    setAuthorized(!!userId && userId === store.owner_id)
                }
                setCheckingStore(false)
            })

        return () => { isMounted = false }
    }, [ownerSlug, userId, profileLoading])

    const fileInputRef = useRef<HTMLInputElement>(null)
    const [saving, setSaving] = useState(false)
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [imagePreview, setImagePreview] = useState<string | null>(null)

    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [price, setPrice] = useState('')
    const [priceType, setPriceType] = useState('fixed')
    const [category, setCategory] = useState('')
    const [productType, setProductType] = useState('physical')
    const [hasAddons, setHasAddons] = useState(false)

    useEffect(() => {
        if (!imageFile) return
        const url = URL.createObjectURL(imageFile)
        setImagePreview(url)
        return () => URL.revokeObjectURL(url)
    }, [imageFile])

    const handleSave = async () => {
        if (!name.trim()) {
            toast.error('Nome do produto é obrigatório')
            return
        }
        if (!storeId) return
        if (!hasStore) {
            toast.error('Assine o plano Loja pra poder vender.')
            router.push('/planos?plan=loja')
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

            const { data: inserted, error: insertError } = await supabase
                .from('products')
                .insert({
                    name: name.trim(),
                    slug,
                    description: description.trim() || null,
                    price: price ? parseFloat(price.replace(',', '.')) : 0,
                    category: category.trim() || null,
                    type: productType,
                    price_type: priceType,
                    listing_type: 'sale',
                    image_url: imagePath,
                    store_id: storeId,
                    has_addons: hasAddons,
                })
                .select('slug')
                .single()

            if (insertError) throw insertError

            toast.success('Produto criado com sucesso!')

            if (hasAddons) {
                toast.info('Agora você pode cadastrar os adicionais e seus preços na tela de edição.')
                router.push(`/${ownerSlug}/${inserted.slug}/editar`)
            } else {
                router.push(`/${ownerSlug}/${inserted.slug}`)
            }
        } catch (err: any) {
            console.error('Erro ao criar produto:', err)
            toast.error('Erro ao criar: ' + (err.message || 'Tente novamente'))
        } finally {
            setSaving(false)
        }
    }

    if (profileLoading || checkingStore) {
        return (
            <div className="min-h-dvh flex items-center justify-center" style={{ background: colors.background }}>
                <Spinner size={32} color={colors.accent} />
            </div>
        )
    }

    if (!authorized) {
        return (
            <div className="min-h-dvh flex items-center justify-center px-4" style={{ background: colors.background }}>
                <div className="text-center">
                    <h1 className="text-xl font-black" style={{ color: '#ef4444' }}>Loja não encontrada ou não autorizado</h1>
                    <p className="text-sm mt-2" style={{ color: colors.textSecondary }}>
                        Você não tem permissão para criar produtos nessa loja.
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
                    title="Criar Produto"
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
                        <div className="flex items-center justify-between mb-6">
                            <h1 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                                Criar Produto
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
                                    disabled={saving}
                                    className="px-6 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all hover:scale-105 disabled:opacity-50"
                                    style={{
                                        background: GRADIENT,
                                        color: '#ffffff',
                                        boxShadow: `0 4px 14px #f9731660`
                                    }}
                                >
                                    {saving ? (
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <Save size={16} />
                                    )}
                                    Criar
                                </button>
                            </div>
                        </div>

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
                                        style={{ borderColor: colors.border, background: colors.surface }}
                                    >
                                        {imagePreview ? (
                                            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="text-center">
                                                <ImageIcon size={32} style={{ color: colors.textSecondary }} />
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
                                                if (fileInputRef.current) fileInputRef.current.value = ''
                                            }}
                                            className="p-2 rounded-lg hover:bg-red-50 transition-colors"
                                            style={{ color: '#ef4444' }}
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                    )}
                                </div>
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
                                        placeholder="Ex: Lanches"
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

                            {/* Adicionais */}
                            <div className="flex items-center gap-3 pt-2 border-t" style={{ borderColor: colors.border }}>
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
                                        Este produto tem adicionais?
                                    </span>
                                    <span className="text-xs" style={{ color: colors.textSecondary }}>
                                        Ex: bacon extra, queijo a mais — você cadastra o preço de cada um depois de criar
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
