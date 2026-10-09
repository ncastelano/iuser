'use client'

// Card de loja usado em todo o app (home, /lojas, /lojas-em-destaque, /lojas/[categoria]) — o /social tem o seu próprio.

import { useEffect, useState, useCallback } from 'react'
import { Store, MapPin, Clock, Eye, ShoppingCart, Coffee } from 'lucide-react'
import { resolveCategoria } from '@/lib/categorias'
import { RatingStars } from '@/components/ratings/RatingStars'
import { isStoreOpenNow, getStoreStatusText, type BusinessHours } from '@/lib/storeHours'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export type StoreCardData = {
    id: string
    name: string
    storeSlug: string
    description?: string | null
    address?: string | null
    logo_url?: string | null
    category?: string | null
    ratings_avg?: number | null
    ratings_count?: number | null
    owner_id: string
    business_hours?: BusinessHours | null
    view_count?: number
    listing_type?: 'sale' | 'publication' | null
    top_products?: {
        id: string
        name: string
        image_url?: string | null
        price: number
        listing_type?: 'sale' | 'publication' | null
    }[]
    recent_reviews?: {
        id: string
        rating: number
        comment?: string
        profile_name?: string
    }[]
}

// ========== COMPONENTE DE STATUS ==========
function StoreStatus({ businessHours }: { businessHours: BusinessHours | null | undefined }) {
    const [statusText, setStatusText] = useState('')
    const [isOpen, setIsOpen] = useState(false)

    const updateStatus = useCallback(() => {
        const open = isStoreOpenNow(businessHours)
        setIsOpen(open)
        setStatusText(getStoreStatusText(businessHours))
    }, [businessHours])

    useEffect(() => {
        updateStatus()
        const interval = setInterval(updateStatus, 30000)
        return () => clearInterval(interval)
    }, [updateStatus])

    const statusColor = isOpen ? '#10b981' : '#ef4444'
    const isLunchTime = statusText.includes('almoço')

    return (
        <div className="flex items-center gap-1.5">
            {isLunchTime ? (
                <Coffee className="w-3 h-3 flex-shrink-0" style={{ color: statusColor }} />
            ) : (
                <Clock className="w-3 h-3 flex-shrink-0" style={{ color: statusColor }} />
            )}
            <span className="text-[10px] font-medium truncate" style={{ color: statusColor }}>
                {statusText}
            </span>
        </div>
    )
}

// ========== COMPONENTE CARD ==========
// Mesmo idioma dos outros cards da home (cantos grandes, capa, texto legível): o logo da loja aparece INTEIRO num
// círculo sobre uma cópia desfocada dele mesmo (nada de logo cortado), e o texto fala como gente.
export function StoreCard({
    store,
    onClick,
    colors,
}: {
    store: StoreCardData
    onClick: () => void
    colors: any
}) {
    const isOpen = isStoreOpenNow(store.business_hours)
    const addressShort = store.address ? store.address.split(',')[0]?.trim() || store.address : ''

    const products = (store.top_products || []).slice(0, 2)
    const review = store.recent_reviews?.[0]
    const hasRating = !!store.ratings_count && store.ratings_count > 0
    const views = store.view_count || 0
    const hasLogo = !!store.logo_url

    const categoryInfo = resolveCategoria(store.category)
    const categoryColor = categoryInfo?.color || '#f97316'
    const categoryName = categoryInfo?.nome || store.category || null

    return (
        <div
            onClick={onClick}
            className="group w-full h-full rounded-3xl overflow-hidden border transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 cursor-pointer flex flex-col"
            style={{ background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}
        >
            {/* Capa: cópia desfocada do logo + o logo inteiro num círculo (só quando a loja tem foto) */}
            {hasLogo && (
            <div className="relative w-full h-40 overflow-hidden flex-shrink-0" style={{ background: GRADIENT }}>
                <img src={store.logo_url!} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover scale-150 blur-2xl opacity-70" loading="lazy" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.35) 100%)' }} />

                <div className="relative w-full h-full flex items-center justify-center pb-2">
                    <div
                        className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center group-hover:scale-105 transition-transform duration-500"
                        style={{ background: '#fff', border: '4px solid rgba(255,255,255,0.95)', boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}
                    >
                        <img src={store.logo_url!} alt={store.name} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                </div>

                <span
                    className="absolute top-3 right-3 px-3 py-1.5 rounded-full text-[11px] font-black flex items-center gap-1.5 backdrop-blur-sm"
                    style={{ background: isOpen ? 'rgba(16,185,129,0.92)' : 'rgba(239,68,68,0.92)', color: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.25)' }}
                >
                    <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? 'bg-white animate-pulse' : 'bg-white/70'}`} />
                    {isOpen ? 'Aberto agora' : 'Fechado agora'}
                </span>

                {views > 0 && (
                    <span className="absolute bottom-3 left-3 flex items-center gap-1 text-[11px] font-bold text-white px-2.5 py-1 rounded-full" style={{ background: 'rgba(0,0,0,0.45)' }} title={`${views} ${views === 1 ? 'pessoa visitou' : 'pessoas visitaram'} esta loja`}>
                        <Eye className="w-3 h-3" />
                        {views}
                    </span>
                )}

                {categoryName && (
                    <span
                        className="absolute bottom-3 right-3 max-w-[60%] truncate px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide text-white"
                        style={{ background: `${categoryColor}ee`, boxShadow: `0 2px 8px ${categoryColor}55` }}
                    >
                        {categoryName}
                    </span>
                )}
            </div>
            )}

            <div className="p-4 flex flex-col gap-3 flex-1">
                <div>
                    <h3 className="text-base font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{store.name}</h3>
                    {addressShort && (
                        <p className="flex items-center gap-1 mt-1 text-xs" style={{ color: colors.textSecondary }}>
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{addressShort}</span>
                        </p>
                    )}
                    {/* Sem foto não tem capa: categoria e visitas vêm aqui, em fichas pequenas */}
                    {!hasLogo && (categoryName || views > 0) && (
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            {categoryName && (
                                <span className="max-w-full truncate px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide text-white" style={{ background: `${categoryColor}ee` }}>
                                    {categoryName}
                                </span>
                            )}
                            {views > 0 && (
                                <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: `${colors.border}40`, color: colors.textSecondary }} title={`${views} ${views === 1 ? 'pessoa visitou' : 'pessoas visitaram'} esta loja`}>
                                    <Eye className="w-3 h-3" />
                                    {views}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* Nota e horário, em frase */}
                <div className="flex flex-col gap-1">
                    {hasRating ? (
                        <div className="flex items-center gap-2 text-xs" style={{ color: colors.textSecondary }}>
                            <RatingStars value={store.ratings_avg || 0} size={13} />
                            <span><b style={{ color: colors.textPrimary }}>{store.ratings_avg?.toFixed(1)}</b> · {store.ratings_count} {store.ratings_count === 1 ? 'avaliação' : 'avaliações'}</span>
                        </div>
                    ) : null}
                    {/* Sem foto o selo Aberto/Fechado agora não tem capa pra ficar: ele ocupa o lugar do texto de horário */}
                    {hasLogo ? (
                        <div className="text-[11px]"><StoreStatus businessHours={store.business_hours} /></div>
                    ) : (
                        <span
                            className="self-start px-3 py-1.5 rounded-full text-[11px] font-black flex items-center gap-1.5"
                            style={{ background: isOpen ? 'rgba(16,185,129,0.92)' : 'rgba(239,68,68,0.92)', color: '#fff' }}
                        >
                            <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? 'bg-white animate-pulse' : 'bg-white/70'}`} />
                            {isOpen ? 'Aberto agora' : 'Fechado agora'}
                        </span>
                    )}
                </div>

                {/* Destaques */}
                {products.length > 0 && (
                    <div className="pt-3 border-t flex flex-col gap-2" style={{ borderColor: colors.border }}>
                        <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Em destaque</p>
                        {products.map((product) => {
                            const isPublication = product.listing_type === 'publication'
                            return (
                                <div key={product.id} className="flex items-center gap-2.5">
                                    <span className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: `${colors.border}40` }}>
                                        {product.image_url
                                            ? <img src={product.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                                            : <ShoppingCart className="w-4 h-4 opacity-40" style={{ color: colors.textPrimary }} />}
                                    </span>
                                    <span className="text-xs font-bold flex-1 min-w-0 truncate" style={{ color: colors.textPrimary }}>{product.name}</span>
                                    {isPublication ? (
                                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: '#8b5cf618', color: '#8b5cf6' }}>Publicação</span>
                                    ) : (
                                        <span className="text-xs font-black flex-shrink-0" style={{ color: '#f97316' }}>{product.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* O que dizem */}
                {review && (
                    <div className="rounded-2xl px-3 py-2" style={{ background: `${colors.border}25` }}>
                        <p className="text-xs italic line-clamp-2" style={{ color: colors.textPrimary }}>
                            {review.comment ? `“${review.comment}”` : 'Avaliou esta loja'}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 text-[11px]" style={{ color: colors.textSecondary }}>
                            <RatingStars value={review.rating} size={10} />
                            {review.profile_name || 'Cliente'}
                        </div>
                    </div>
                )}

                <span
                    className="mt-auto w-full text-center py-2.5 rounded-full font-black text-sm text-white transition-transform group-hover:scale-[1.02]"
                    style={{ background: GRADIENT, boxShadow: '0 4px 12px #f9731640' }}
                >
                    Visitar loja
                </span>
            </div>
        </div>
    )
}

// ========== SKELETON CARD ==========
export function StoreCardSkeleton({ colors }: { colors: any }) {
    const bar = (w: string, h = 12) => <div className="rounded-full" style={{ width: w, height: h, background: `${colors.border}40` }} />
    return (
        <div className="w-full rounded-3xl overflow-hidden border flex flex-col animate-pulse" style={{ borderColor: colors.border, background: colors.surface }}>
            <div className="w-full h-40 flex items-center justify-center" style={{ background: `${colors.border}35` }}>
                <div className="w-24 h-24 rounded-full" style={{ background: `${colors.border}50` }} />
            </div>
            <div className="p-4 flex flex-col gap-3">
                <div className="flex flex-col gap-2">{bar('70%', 18)}{bar('45%')}</div>
                <div className="flex flex-col gap-2">{bar('60%')}{bar('50%')}</div>
                <div className="pt-3 border-t flex flex-col gap-2" style={{ borderColor: colors.border }}>
                    <div className="flex items-center gap-2.5"><div className="w-10 h-10 rounded-xl" style={{ background: `${colors.border}35` }} />{bar('55%')}</div>
                    <div className="flex items-center gap-2.5"><div className="w-10 h-10 rounded-xl" style={{ background: `${colors.border}35` }} />{bar('45%')}</div>
                </div>
                <div className="rounded-full" style={{ height: 40, background: `${colors.border}35` }} />
            </div>
        </div>
    )
}

