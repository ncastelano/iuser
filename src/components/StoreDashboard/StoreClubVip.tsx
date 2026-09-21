// components/StoreDashboard/StoreClubVip.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { toast } from 'sonner'
import { hexToRgb } from '@/lib/color'
import {
    ChevronDown,
    ChevronUp,
    Plus,
    ImageIcon,
    Send,
    Crown,
    Users,
    Gift,
    Check,
    Receipt,
} from 'lucide-react'
import { generateUniqueGlobalSlug } from '@/lib/slugUtils'

interface StoreClubVipProps {
    storeId: string
}

interface Member {
    id: string
    profile_id: string
    joined_at: string
    profiles: { name: string | null; avatar_url: string | null; profileSlug: string | null } | null
}

interface StoreProduct {
    id: string
    name: string
    price: number
}

interface Campaign {
    id: string
    publication_id: string
    discount_type: 'percent' | 'fixed' | 'full'
    discount_value: number | null
    product_ids: string[]
    active: boolean
    created_at: string
    products: { name: string; description: string | null } | null
}

interface Redemption {
    id: string
    status: string
    redeemed_at: string | null
    redeemed_via: string | null
    campaign_id: string
}

const GRADIENT = 'linear-gradient(135deg, #a855f7, #6366f1)'

const pillButtonStyle: React.CSSProperties = {
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
}

function startOfPeriod(daysAgo: number): string {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - daysAgo)
    return d.toISOString()
}

export default function StoreClubVip({ storeId }: StoreClubVipProps) {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [isExpanded, setIsExpanded] = useState(true)
    const [loading, setLoading] = useState(false)
    const [vipEnabled, setVipEnabled] = useState(false)
    const [vipPrice, setVipPrice] = useState<number | null>(null)
    const [savingToggle, setSavingToggle] = useState(false)

    const [members, setMembers] = useState<Member[]>([])
    const [campaigns, setCampaigns] = useState<Campaign[]>([])
    const [redemptions, setRedemptions] = useState<Redemption[]>([])
    const [products, setProducts] = useState<StoreProduct[]>([])

    const [isCreating, setIsCreating] = useState(false)
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<string | null>(null)
    const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
    const [discountType, setDiscountType] = useState<'percent' | 'fixed' | 'full'>('percent')
    const [discountValue, setDiscountValue] = useState('')
    const [saving, setSaving] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const [{ data: storeData }, { data: membersData }, { data: campaignsData }, { data: productsData }] = await Promise.all([
                supabase.from('stores').select('vip_club_enabled, vip_club_price').eq('id', storeId).single(),
                supabase
                    .from('store_vip_members')
                    .select('id, profile_id, joined_at, profiles:profile_id (name, avatar_url, profileSlug)')
                    .eq('store_id', storeId)
                    .eq('status', 'active')
                    .order('joined_at', { ascending: false }),
                supabase
                    .from('store_campaigns')
                    .select('id, publication_id, discount_type, discount_value, product_ids, active, created_at, products:publication_id (name, description)')
                    .eq('store_id', storeId)
                    .order('created_at', { ascending: false }),
                supabase
                    .from('products')
                    .select('id, name, price')
                    .eq('store_id', storeId)
                    .eq('is_active', true)
                    .not('listing_type', 'in', '(publication,vip_campaign)'),
            ])

            if (storeData) {
                setVipEnabled(!!storeData.vip_club_enabled)
                setVipPrice(storeData.vip_club_price !== null ? Number(storeData.vip_club_price) : null)
            }
            setMembers((membersData as any) || [])
            const campaignRows = (campaignsData as any) || []
            setCampaigns(campaignRows)
            setProducts((productsData as StoreProduct[]) || [])

            const campaignIds = campaignRows.map((c: Campaign) => c.id)
            if (campaignIds.length > 0) {
                const { data: redemptionsData } = await supabase
                    .from('store_campaign_redemptions')
                    .select('id, status, redeemed_at, redeemed_via, campaign_id')
                    .in('campaign_id', campaignIds)
                    .eq('status', 'redeemed')
                setRedemptions((redemptionsData as Redemption[]) || [])
            } else {
                setRedemptions([])
            }
        } catch (err) {
            console.error('[StoreClubVip] Erro ao carregar:', err)
        } finally {
            setLoading(false)
        }
    }, [storeId])

    useEffect(() => {
        if (isExpanded) load()
    }, [isExpanded, load])

    useEffect(() => {
        if (!imageFile) return
        const url = URL.createObjectURL(imageFile)
        setPreview(url)
        return () => URL.revokeObjectURL(url)
    }, [imageFile])

    const toggleVip = async (enabled: boolean) => {
        setSavingToggle(true)
        try {
            const { error } = await supabase.from('stores').update({ vip_club_enabled: enabled }).eq('id', storeId)
            if (error) throw error
            setVipEnabled(enabled)
            toast.success(enabled ? 'Club VIP ativado!' : 'Club VIP desativado')
        } catch (err: any) {
            toast.error(err.message || 'Erro ao atualizar')
        } finally {
            setSavingToggle(false)
        }
    }

    const toggleProduct = (id: string) => {
        setSelectedProductIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
    }

    const handleCreateCampaign = async () => {
        if (!name.trim()) {
            toast.error('Dê um nome à campanha')
            return
        }
        if (selectedProductIds.length === 0) {
            toast.error('Escolha pelo menos um produto')
            return
        }
        if (discountType !== 'full' && (!discountValue || Number(discountValue) <= 0)) {
            toast.error('Informe o valor do desconto')
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

            const { data: publicationRow, error: pubError } = await supabase
                .from('products')
                .insert({
                    name,
                    slug,
                    description: description || null,
                    price: 0,
                    type: 'physical',
                    price_type: 'fixed',
                    listing_type: 'vip_campaign',
                    image_url: imagePath,
                    store_id: storeId,
                })
                .select('id')
                .single()

            if (pubError || !publicationRow) throw pubError || new Error('Erro ao criar publicação da campanha')

            const { error: campaignError } = await supabase.from('store_campaigns').insert({
                store_id: storeId,
                publication_id: publicationRow.id,
                discount_type: discountType,
                discount_value: discountType === 'full' ? null : Number(discountValue.replace(',', '.')),
                product_ids: selectedProductIds,
            })

            if (campaignError) throw campaignError

            toast.success('Campanha criada! Os membros já podem resgatar.')
            setName('')
            setDescription('')
            setImageFile(null)
            setPreview(null)
            setSelectedProductIds([])
            setDiscountValue('')
            setDiscountType('percent')
            setIsCreating(false)
            await load()
        } catch (err: any) {
            console.error('Erro ao criar campanha:', err)
            toast.error(err.message || 'Erro ao criar campanha')
        } finally {
            setSaving(false)
        }
    }

    const getImageUrl = (path: string | null) => {
        if (!path) return null
        if (path.startsWith('http')) return path
        return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
    }

    const redeemedToday = redemptions.filter((r) => r.redeemed_at && r.redeemed_at >= startOfPeriod(0)).length
    const redeemedWeek = redemptions.filter((r) => r.redeemed_at && r.redeemed_at >= startOfPeriod(7)).length
    const redeemedMonth = redemptions.filter((r) => r.redeemed_at && r.redeemed_at >= startOfPeriod(30)).length

    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary

    const discountLabel = (c: Campaign) => {
        if (c.discount_type === 'full') return 'Grátis'
        if (c.discount_type === 'percent') return `${c.discount_value}% off`
        return `R$ ${Number(c.discount_value).toFixed(2)} off`
    }

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
                            <Crown size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black" style={{ color: textPrimary }}>Club VIP</h3>
                            <p className="text-xs mt-0.5" style={{ color: textSecondary }}>
                                {vipEnabled ? `${members.length} membro${members.length !== 1 ? 's' : ''}` : 'Desativado'}
                            </p>
                        </div>
                    </div>
                    {isExpanded ? <ChevronUp size={22} style={{ color: textSecondary }} /> : <ChevronDown size={22} style={{ color: textSecondary }} />}
                </button>

                {isExpanded && (
                    <div className="flex flex-col gap-5">
                        {loading ? (
                            <div className="flex justify-center py-8">
                                <div className="w-6 h-6 border-2 border-purple-200 border-t-purple-500 rounded-full animate-spin" />
                            </div>
                        ) : (
                            <>
                                {/* Toggle gratuito/pago */}
                                <div className="rounded-2xl p-4 border space-y-3" style={{ borderColor: colors.border, background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)` }}>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-bold" style={{ color: textPrimary }}>Clube gratuito</p>
                                            <p className="text-[11px]" style={{ color: textSecondary }}>Qualquer cliente entra de graça e vê suas campanhas exclusivas</p>
                                        </div>
                                        <button
                                            onClick={() => toggleVip(!vipEnabled)}
                                            disabled={savingToggle}
                                            className="w-12 h-7 rounded-full flex items-center px-1 transition-all flex-shrink-0"
                                            style={{ background: vipEnabled ? GRADIENT : colors.border, justifyContent: vipEnabled ? 'flex-end' : 'flex-start' }}
                                        >
                                            <div className="w-5 h-5 rounded-full bg-white" />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-2 text-[11px] px-3 py-2 rounded-xl" style={{ background: `${colors.border}30`, color: textSecondary }}>
                                        <Gift size={12} />
                                        Clube pago (mensalidade) em breve — por enquanto todo clube é gratuito.
                                    </div>
                                </div>

                                {vipEnabled && (
                                    <>
                                        {/* Estatísticas de resgate */}
                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="rounded-xl p-3 text-center" style={{ background: `${colors.border}20` }}>
                                                <p className="text-lg font-black" style={{ color: textPrimary }}>{redeemedToday}</p>
                                                <p className="text-[9px] uppercase font-bold" style={{ color: textSecondary }}>Hoje</p>
                                            </div>
                                            <div className="rounded-xl p-3 text-center" style={{ background: `${colors.border}20` }}>
                                                <p className="text-lg font-black" style={{ color: textPrimary }}>{redeemedWeek}</p>
                                                <p className="text-[9px] uppercase font-bold" style={{ color: textSecondary }}>Semana</p>
                                            </div>
                                            <div className="rounded-xl p-3 text-center" style={{ background: `${colors.border}20` }}>
                                                <p className="text-lg font-black" style={{ color: textPrimary }}>{redeemedMonth}</p>
                                                <p className="text-[9px] uppercase font-bold" style={{ color: textSecondary }}>Mês</p>
                                            </div>
                                        </div>

                                        {/* Membros */}
                                        <div className="space-y-2">
                                            <p className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: textSecondary }}>
                                                <Users size={12} /> Membros ({members.length})
                                            </p>
                                            {members.length === 0 ? (
                                                <p className="text-xs" style={{ color: textSecondary }}>Ninguém entrou no clube ainda.</p>
                                            ) : (
                                                <div className="flex flex-wrap gap-2">
                                                    {members.map((m) => {
                                                        const avatarUrl = getImageUrl(m.profiles?.avatar_url || null)
                                                        return (
                                                            <div key={m.id} className="flex items-center gap-2 pr-3 rounded-full" style={{ background: `${colors.border}20` }}>
                                                                <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: `${colors.accent}20` }}>
                                                                    {avatarUrl ? <img src={avatarUrl} className="w-full h-full object-cover" alt="" /> : <Users size={12} style={{ color: colors.accent }} />}
                                                                </div>
                                                                <span className="text-[11px] font-bold" style={{ color: textPrimary }}>
                                                                    {m.profiles?.name || (m.profiles?.profileSlug ? `@${m.profiles.profileSlug}` : 'Membro')}
                                                                </span>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        {/* Campanhas */}
                                        <div className="space-y-2">
                                            <p className="text-xs font-black uppercase tracking-wider" style={{ color: textSecondary }}>
                                                Campanhas ({campaigns.length})
                                            </p>
                                            {campaigns.map((c) => {
                                                const campaignRedemptions = redemptions.filter((r) => r.campaign_id === c.id)
                                                return (
                                                    <div key={c.id} className="rounded-xl p-3 flex items-center justify-between gap-2" style={{ background: `${colors.border}20` }}>
                                                        <div className="min-w-0">
                                                            <p className="text-xs font-bold truncate" style={{ color: textPrimary }}>{c.products?.name}</p>
                                                            <p className="text-[10px] flex items-center gap-1" style={{ color: textSecondary }}>
                                                                <Receipt size={10} /> {campaignRedemptions.length} resgate{campaignRedemptions.length !== 1 ? 's' : ''}
                                                            </p>
                                                        </div>
                                                        <span className="text-[10px] font-black px-2 py-1 rounded-full flex-shrink-0" style={{ background: '#22c55e20', color: '#22c55e' }}>
                                                            {discountLabel(c)}
                                                        </span>
                                                    </div>
                                                )
                                            })}
                                        </div>

                                        {!isCreating && (
                                            <button
                                                onClick={() => setIsCreating(true)}
                                                style={{ ...pillButtonStyle, width: '100%', padding: '0.75rem', background: 'transparent', border: `1px dashed ${colors.border}`, color: '#a855f7' }}
                                                className="hover:bg-white/5 transition-colors"
                                            >
                                                <Plus size={16} />
                                                Nova campanha
                                            </button>
                                        )}

                                        {isCreating && (
                                            <div className="rounded-2xl p-4 border space-y-4" style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`, borderColor: colors.border }}>
                                                <h4 className="text-sm font-black flex items-center gap-2" style={{ color: textPrimary }}>
                                                    <Send size={16} style={{ color: '#a855f7' }} />
                                                    Nova campanha
                                                </h4>

                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold uppercase" style={{ color: textSecondary }}>Imagem (opcional)</label>
                                                    <div
                                                        onClick={() => fileInputRef.current?.click()}
                                                        className="w-20 h-20 rounded-xl border-2 flex items-center justify-center cursor-pointer overflow-hidden"
                                                        style={{ borderColor: colors.border, background: colors.background }}
                                                    >
                                                        {preview ? <img src={preview} className="w-full h-full object-cover" alt="" /> : <ImageIcon size={20} style={{ color: textSecondary }} />}
                                                    </div>
                                                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setImageFile(f) }} />
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold uppercase" style={{ color: textSecondary }}>Título da campanha</label>
                                                    <input
                                                        type="text"
                                                        placeholder="Ex: Semana do desconto VIP"
                                                        value={name}
                                                        onChange={(e) => setName(e.target.value)}
                                                        className="w-full px-3 py-2 rounded-full border text-sm focus:outline-none"
                                                        style={{ background: colors.background, borderColor: colors.border, color: textPrimary }}
                                                    />
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold uppercase" style={{ color: textSecondary }}>Descrição</label>
                                                    <textarea
                                                        placeholder="Conte pros membros o que rolou..."
                                                        value={description}
                                                        onChange={(e) => setDescription(e.target.value)}
                                                        rows={2}
                                                        className="w-full px-3 py-2 rounded-2xl border text-sm focus:outline-none resize-none"
                                                        style={{ background: colors.background, borderColor: colors.border, color: textPrimary }}
                                                    />
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold uppercase" style={{ color: textSecondary }}>Produtos participantes</label>
                                                    {products.length === 0 ? (
                                                        <p className="text-xs" style={{ color: textSecondary }}>Cadastre produtos na loja primeiro.</p>
                                                    ) : (
                                                        <div className="flex flex-wrap gap-2">
                                                            {products.map((p) => {
                                                                const selected = selectedProductIds.includes(p.id)
                                                                return (
                                                                    <button
                                                                        key={p.id}
                                                                        type="button"
                                                                        onClick={() => toggleProduct(p.id)}
                                                                        className="flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-full transition-all"
                                                                        style={{
                                                                            background: selected ? GRADIENT : `${colors.border}30`,
                                                                            color: selected ? '#fff' : textPrimary,
                                                                        }}
                                                                    >
                                                                        {selected && <Check size={11} />}
                                                                        {p.name}
                                                                    </button>
                                                                )
                                                            })}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold uppercase" style={{ color: textSecondary }}>Tipo de desconto</label>
                                                    <div className="flex gap-2">
                                                        {(['percent', 'fixed', 'full'] as const).map((t) => (
                                                            <button
                                                                key={t}
                                                                type="button"
                                                                onClick={() => setDiscountType(t)}
                                                                className="flex-1 text-[11px] font-bold py-2 rounded-xl transition-all"
                                                                style={{ background: discountType === t ? GRADIENT : `${colors.border}30`, color: discountType === t ? '#fff' : textPrimary }}
                                                            >
                                                                {t === 'percent' ? '% Percentual' : t === 'fixed' ? 'R$ Fixo' : 'Grátis'}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {discountType !== 'full' && (
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-bold uppercase" style={{ color: textSecondary }}>
                                                            {discountType === 'percent' ? 'Percentual de desconto' : 'Valor do desconto (R$)'}
                                                        </label>
                                                        <input
                                                            type="text"
                                                            inputMode="decimal"
                                                            placeholder={discountType === 'percent' ? '20' : '10,00'}
                                                            value={discountValue}
                                                            onChange={(e) => setDiscountValue(e.target.value)}
                                                            className="w-full px-3 py-2 rounded-full border text-sm focus:outline-none"
                                                            style={{ background: colors.background, borderColor: colors.border, color: textPrimary }}
                                                        />
                                                    </div>
                                                )}

                                                <div className="flex gap-2 pt-2">
                                                    <button
                                                        onClick={() => { setIsCreating(false); setName(''); setDescription(''); setImageFile(null); setPreview(null); setSelectedProductIds([]); setDiscountValue('') }}
                                                        style={{ ...pillButtonStyle, flex: 1, background: 'transparent', border: `2px solid ${colors.border}`, color: textSecondary }}
                                                    >
                                                        Cancelar
                                                    </button>
                                                    <button
                                                        onClick={handleCreateCampaign}
                                                        disabled={saving}
                                                        style={{ ...pillButtonStyle, flex: 1, background: GRADIENT, color: '#ffffff', opacity: saving ? 0.6 : 1 }}
                                                    >
                                                        {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Send size={14} /> Publicar</>}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
