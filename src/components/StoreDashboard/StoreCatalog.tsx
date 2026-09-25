// components/StoreDashboard/StoreCatalog.tsx
//
// Lista de "Produtos da Loja" ou "Serviços da Loja" — mesmo componente pros
// dois, só troca o filtro (products.type) e os textos. Produtos e serviços
// usam a mesma tela de criação (/criar-produto), só o campo "Tipo" muda —
// por isso o botão "Adicionar" de cada seção já manda pra lá com o tipo
// certo pré-selecionado (?type=service pros serviços).
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { hexToRgb } from '@/lib/color'
import { Package, Wrench, ChevronDown, ChevronUp, Plus, Pencil, ArrowUpDown } from 'lucide-react'
import { startOfDay } from 'date-fns'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

const pillButtonStyle = {
    padding: '0.75rem 1.25rem',
    borderRadius: '9999px',
    fontWeight: 700,
    fontSize: '0.875rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    border: 'none',
}

interface CatalogItem {
    id: string
    name: string
    price: number
    image_url: string | null
    slug: string
    viewsToday: number
    viewsTotal: number
    inCart: number
    salesCount: number
}

interface StoreCatalogProps {
    storeId: string
    storeSlug: string
    kind: 'product' | 'service'
}

export default function StoreCatalog({ storeId, storeSlug, kind }: StoreCatalogProps) {
    const { colors } = useTheme()
    const router = useRouter()
    const surfaceRgb = hexToRgb(colors.surface)

    const [items, setItems] = useState<CatalogItem[]>([])
    const [loading, setLoading] = useState(true)
    const [isExpanded, setIsExpanded] = useState(true)
    const [sortBy, setSortBy] = useState<'mostSold' | 'leastSold' | 'mostExpensive' | 'cheapest'>('mostSold')

    const load = useCallback(async () => {
        if (!storeId) return
        setLoading(true)

        let query = supabase
            .from('products')
            .select('id, name, price, image_url, slug')
            .eq('store_id', storeId)
            .eq('listing_type', 'sale')
            .order('created_at', { ascending: false })
            .limit(12)
        query = kind === 'service' ? query.eq('type', 'service') : query.neq('type', 'service')

        const { data: rows } = await query

        if (!rows || rows.length === 0) {
            setItems([])
            setLoading(false)
            return
        }

        const ids = rows.map((p) => p.id)
        const todayStartISO = startOfDay(new Date()).toISOString()

        const [{ data: viewsToday }, { data: viewsTotal }, { data: orderIdsData }] = await Promise.all([
            supabase.from('product_views').select('product_id').in('product_id', ids).gte('created_at', todayStartISO),
            supabase.from('product_views').select('product_id').in('product_id', ids),
            supabase.from('orders').select('id').eq('store_id', storeId).eq('status', 'paid'),
        ])

        const viewsTodayMap = new Map<string, number>()
        viewsToday?.forEach((v) => viewsTodayMap.set(v.product_id, (viewsTodayMap.get(v.product_id) || 0) + 1))
        const viewsTotalMap = new Map<string, number>()
        viewsTotal?.forEach((v) => viewsTotalMap.set(v.product_id, (viewsTotalMap.get(v.product_id) || 0) + 1))

        const orderIds = orderIdsData?.map((o) => o.id) || []
        const salesCountMap = new Map<string, number>()
        if (orderIds.length > 0) {
            const { data: orderItemsSales } = await supabase
                .from('order_items')
                .select('product_id, quantity')
                .in('order_id', orderIds)
                .in('product_id', ids)
            orderItemsSales?.forEach((s) => {
                salesCountMap.set(s.product_id, (salesCountMap.get(s.product_id) || 0) + (s.quantity || 1))
            })
        }

        setItems(rows.map((p) => ({
            ...p,
            viewsToday: viewsTodayMap.get(p.id) || 0,
            viewsTotal: viewsTotalMap.get(p.id) || 0,
            inCart: 0,
            salesCount: salesCountMap.get(p.id) || 0,
        })))
        setLoading(false)
    }, [storeId, kind])

    useEffect(() => { load() }, [load])

    const sortedItems = [...items].sort((a, b) => {
        switch (sortBy) {
            case 'mostSold': return b.salesCount - a.salesCount
            case 'leastSold': return a.salesCount - b.salesCount
            case 'mostExpensive': return b.price - a.price
            case 'cheapest': return a.price - b.price
            default: return 0
        }
    })

    const isService = kind === 'service'
    const Icon = isService ? Wrench : Package
    const title = isService ? 'Serviços da Loja' : 'Produtos da Loja'
    const emptyLabel = isService ? 'Nenhum serviço cadastrado.' : 'Nenhum produto cadastrado.'
    const createLabel = isService ? 'Criar primeiro serviço' : 'Criar primeiro produto'
    const createHref = `/${storeSlug}/criar-produto${isService ? '?type=service' : ''}`

    return (
        <div className="mb-6">
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
                            <Icon size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>{title}</h3>
                            <div className="flex items-center gap-3 text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                                <span>{items.length} cadastrado{items.length === 1 ? '' : 's'}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {items.length > 0 && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#f9731620', color: '#f97316' }}>
                                {items.length}
                            </span>
                        )}
                        {isExpanded ? <ChevronUp size={22} style={{ color: colors.textSecondary }} /> : <ChevronDown size={22} style={{ color: colors.textSecondary }} />}
                    </div>
                </button>

                {isExpanded && (
                    loading ? (
                        <div className="flex justify-center py-8">
                            <div className="w-6 h-6 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1 text-xs" style={{ color: colors.textSecondary }}>
                                        <ArrowUpDown size={14} />
                                        <select
                                            value={sortBy}
                                            onChange={(e) => setSortBy(e.target.value as any)}
                                            className="bg-transparent border rounded-full px-3 py-1 text-xs"
                                            style={{ borderColor: colors.border, color: colors.textPrimary }}
                                        >
                                            <option value="mostSold">Mais vendidos</option>
                                            <option value="leastSold">Menos vendidos</option>
                                            <option value="mostExpensive">Mais caro</option>
                                            <option value="cheapest">Mais barato</option>
                                        </select>
                                    </div>
                                </div>
                                <button
                                    onClick={() => router.push(createHref)}
                                    style={{ ...pillButtonStyle, background: GRADIENT, color: '#ffffff', boxShadow: `0 4px 12px #f9731640` }}
                                    className="hover:scale-105 transition-transform"
                                >
                                    <Plus size={14} /> Adicionar
                                </button>
                            </div>

                            {sortedItems.length === 0 ? (
                                <div
                                    className="rounded-xl p-6 text-center"
                                    style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`, border: `1px dashed ${colors.border}` }}
                                >
                                    <p className="text-sm" style={{ color: colors.textSecondary }}>{emptyLabel}</p>
                                    <button
                                        onClick={() => router.push(createHref)}
                                        style={{ ...pillButtonStyle, background: GRADIENT, color: '#ffffff' }}
                                        className="mx-auto hover:opacity-80 transition-opacity"
                                    >
                                        <Plus size={14} /> {createLabel}
                                    </button>
                                </div>
                            ) : (
                                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-400">
                                    {sortedItems.map((item) => {
                                        const imgUrl = item.image_url ? supabase.storage.from('product-images').getPublicUrl(item.image_url).data.publicUrl : null
                                        return (
                                            <div
                                                key={item.id}
                                                className="flex-shrink-0 w-40 rounded-2xl border p-3 flex flex-col gap-2 cursor-pointer hover:shadow-md transition-shadow relative"
                                                style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`, borderColor: colors.border }}
                                                onClick={() => router.push(`/${storeSlug}/${item.slug || item.id}`)}
                                            >
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); router.push(`/${storeSlug}/${item.slug || item.id}/editar`) }}
                                                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center hover:bg-black/50 transition-colors z-10"
                                                    title={isService ? 'Editar serviço' : 'Editar produto'}
                                                >
                                                    <Pencil size={14} color="white" />
                                                </button>

                                                <div className="w-full h-28 rounded-xl overflow-hidden bg-gray-100">
                                                    {imgUrl ? (
                                                        <img src={imgUrl} className="w-full h-full object-cover" alt="" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center" style={{ color: colors.textSecondary }}>
                                                            <Icon size={28} />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>{item.name}</p>
                                                    <p className="text-xs font-bold mt-1" style={{ color: '#f97316' }}>R$ {Number(item.price).toFixed(2)}</p>
                                                    <div className="flex flex-col text-[10px] mt-1 space-y-0.5" style={{ color: colors.textSecondary }}>
                                                        <span>👁 {item.viewsToday} hoje</span>
                                                        <span>📊 {item.viewsTotal} views</span>
                                                        <span>💰 {item.salesCount} vendas</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </>
                    )
                )}
            </div>
        </div>
    )
}
