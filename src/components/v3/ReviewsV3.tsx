// src/components/v3/ReviewsV3.tsx
//
// Avaliações de uma loja na interface 3.0: resumo (nota média + barras por estrela) e lista corrida SEM cartões nem caixa de rolagem,
// aparecendo aos poucos ("Ver mais avaliações"). Pensada para lojas com centenas de avaliações. Só apresentação:
// os dados chegam prontos de `Store.tsx` e o avatar (moldura do plano, imagem) vem por `renderAvatar`.
'use client'

import Link from 'next/link'
import { useMemo, useState, type ReactNode } from 'react'
import { Star } from 'lucide-react'
import { RatingStars } from '@/components/ratings/RatingStars'
import { profileLabel } from '@/lib/profileDisplay'

const ORANGE = '#f97316'
const PAGE = 8

export interface ReviewV3Row {
    id: string
    rating: number
    comment?: string | null
    is_anonymous?: boolean
    created_at: string
    products?: { name?: string | null } | null
    profiles?: { profileSlug?: string | null; name?: string | null } | null
}

export default function ReviewsV3({ ratings, colors, renderAvatar }: { ratings: ReviewV3Row[]; colors: any; renderAvatar: (r: ReviewV3Row) => ReactNode }) {
    const [shown, setShown] = useState(PAGE)
    const stats = useMemo(() => {
        const counts = [0, 0, 0, 0, 0]
        let sum = 0
        for (const r of ratings) { counts[Math.min(5, Math.max(1, Math.round(r.rating))) - 1]++; sum += r.rating }
        return { counts, avg: ratings.length ? sum / ratings.length : 0 }
    }, [ratings])

    if (ratings.length === 0) {
        return (
            <div className="py-10 text-center">
                <Star className="w-7 h-7 mx-auto mb-2" style={{ color: colors.textSecondary }} />
                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Nenhuma avaliação ainda</p>
                <p className="text-xs" style={{ color: colors.textSecondary }}>Seja o primeiro a avaliar!</p>
            </div>
        )
    }

    return (
        <div>
            <div className="flex items-center gap-5 pb-4">
                <div className="text-center flex-shrink-0">
                    <p className="text-[40px] leading-none font-black" style={{ color: colors.textPrimary }}>{stats.avg.toFixed(1).replace('.', ',')}</p>
                    <div className="mt-1 flex justify-center"><RatingStars value={stats.avg} size={13} /></div>
                    <p className="mt-1 text-[11px] font-bold" style={{ color: colors.textSecondary }}>{ratings.length} avaliações</p>
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                    {[5, 4, 3, 2, 1].map((star) => {
                        const n = stats.counts[star - 1]
                        return (
                            <div key={star} className="flex items-center gap-2 text-[10px] font-bold" style={{ color: colors.textSecondary }}>
                                <span className="w-2 text-right">{star}</span>
                                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: `${colors.border}60` }}>
                                    <div className="h-full rounded-full" style={{ width: `${(n / ratings.length) * 100}%`, background: ORANGE }} />
                                </div>
                                <span className="w-6 text-right">{n}</span>
                            </div>
                        )
                    })}
                </div>
            </div>

            <ul>
                {ratings.slice(0, shown).map((r) => (
                    <li key={r.id} className="flex gap-3 py-3" style={{ borderTop: `1px solid ${colors.border}50` }}>
                        {renderAvatar(r)}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-2">
                                {r.is_anonymous || !r.profiles?.profileSlug ? (
                                    <p className="text-[13px] font-black truncate" style={{ color: colors.textPrimary }}>{r.is_anonymous ? 'Anônimo' : profileLabel(r.profiles)}</p>
                                ) : (
                                    <Link href={`/${r.profiles.profileSlug}`} className="text-[13px] font-black truncate hover:underline" style={{ color: colors.textPrimary }}>{profileLabel(r.profiles)}</Link>
                                )}
                                <span className="text-[11px] flex-shrink-0" style={{ color: colors.textSecondary }}>
                                    {new Date(r.created_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                                <RatingStars value={r.rating} size={12} />
                                {!r.is_anonymous && r.products?.name && (
                                    <span className="text-[11px] font-bold truncate max-w-[180px]" style={{ color: colors.textSecondary }}>{r.products.name}</span>
                                )}
                            </div>
                            {r.comment && <p className="mt-1 text-[13px] leading-relaxed" style={{ color: colors.textPrimary }}>{r.comment}</p>}
                        </div>
                    </li>
                ))}
            </ul>

            {shown < ratings.length && (
                <button onClick={() => setShown((n) => n + 10)} className="mt-2 w-full h-10 rounded-full text-[13px] font-black transition active:scale-95" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>
                    Ver mais avaliações ({ratings.length - shown})
                </button>
            )}
        </div>
    )
}
