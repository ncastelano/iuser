// src/components/v3/ProductReviewsV3.tsx
//
// Avaliações de um produto/serviço na interface 3.0.
//  - Fechado: um cartão com a nota e UMA avaliação por vez, trocando sozinha a cada 10 segundos, da mais curtida para a menos curtida
//    (volta ao começo no fim). Tocar no cartão abre tudo.
//  - Aberto: resumo por estrela + lista completa (mais curtidas ou mais recentes), com curtir em cada avaliação e "Ver mais".
// Só apresentação: os dados e a ação de curtir chegam prontos de `ProductClientPage.tsx`.
'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronDown, Heart } from 'lucide-react'
import { RatingStars } from '@/components/ratings/RatingStars'
import { profileLabel } from '@/lib/profileDisplay'

const ORANGE = '#f97316'
const ROTATE_MS = 10_000
const ROTATING_MAX = 12
const PAGE = 8

export interface ProductReviewV3 {
    id: string
    rating: number
    comment: string | null
    is_anonymous: boolean
    created_at: string
    profiles: { id?: string; name: string | null; avatar_url: string | null; profileSlug?: string | null } | null
    like_count: number
    is_liked: boolean
}

const byLikes = (a: ProductReviewV3, b: ProductReviewV3) =>
    b.like_count - a.like_count || b.rating - a.rating || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()

// `linkable`: na lista aberta, avatar e nome levam ao perfil; no cartão que gira não (tocar em qualquer parte dele abre as avaliações)
function Reviewer({ r, colors, avatar, linkable = true }: { r: ProductReviewV3; colors: any; avatar: ReactNode; linkable?: boolean }) {
    const linked = linkable && !r.is_anonymous && !!r.profiles?.profileSlug
    const name = r.is_anonymous ? 'Anônimo' : profileLabel(r.profiles)
    return (
        <div className="flex items-center gap-2.5 min-w-0">
            {linked ? <Link href={`/${r.profiles!.profileSlug}`} onClick={(e) => e.stopPropagation()} aria-label={`Ver perfil de ${name}`} className="flex-shrink-0">{avatar}</Link> : avatar}
            <div className="min-w-0">
                {linked
                    ? <Link href={`/${r.profiles!.profileSlug}`} onClick={(e) => e.stopPropagation()} className="block text-[13px] font-black truncate hover:underline" style={{ color: colors.textPrimary }}>{name}</Link>
                    : <p className="text-[13px] font-black truncate" style={{ color: colors.textPrimary }}>{name}</p>}
                <RatingStars value={r.rating} size={11} />
            </div>
        </div>
    )
}

export default function ProductReviewsV3({
    reviews, colors, avgRating, renderAvatar, onToggleLike,
}: {
    reviews: ProductReviewV3[]
    colors: any
    avgRating: number
    renderAvatar: (r: ProductReviewV3) => ReactNode
    onToggleLike: (id: string) => void
}) {
    const [open, setOpen] = useState(false)
    const [sort, setSort] = useState<'likes' | 'recent'>('likes')
    const [shown, setShown] = useState(PAGE)
    const [idx, setIdx] = useState(0)

    // cartão que gira: todas as avaliações, da mais curtida para a menos
    const rotating = useMemo(() => {
        // todas as avaliações, da mais curtida para a menos; no empate as que têm texto vêm antes (as só com nota também giram)
        const hasText = (r: ProductReviewV3) => (r.comment && r.comment.trim() ? 1 : 0)
        return [...reviews].sort((a, b) => b.like_count - a.like_count || hasText(b) - hasText(a) || byLikes(a, b)).slice(0, ROTATING_MAX)
    }, [reviews])

    useEffect(() => {
        if (open || rotating.length < 2) return
        const t = setInterval(() => { if (!document.hidden) setIdx((i) => (i + 1) % rotating.length) }, ROTATE_MS)
        return () => clearInterval(t)
    }, [open, rotating.length])
    useEffect(() => { if (idx >= rotating.length) setIdx(0) }, [rotating.length, idx])

    const stats = useMemo(() => {
        const counts = [0, 0, 0, 0, 0]
        for (const r of reviews) counts[Math.min(5, Math.max(1, Math.round(r.rating))) - 1]++
        return counts
    }, [reviews])
    const list = useMemo(() => (sort === 'likes' ? [...reviews].sort(byLikes) : [...reviews].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())), [reviews, sort])

    if (reviews.length === 0) return null
    const soft = `${colors.border}30`
    const current = rotating[idx] ?? rotating[0]

    const summary = (
        <div className="flex items-center gap-3">
            <p className="text-[34px] leading-none font-black" style={{ color: colors.textPrimary }}>{avgRating.toFixed(1).replace('.', ',')}</p>
            <div className="flex-1 min-w-0">
                <RatingStars value={avgRating} size={14} />
                <p className="mt-0.5 text-[12px] font-bold" style={{ color: colors.textSecondary }}>{reviews.length} {reviews.length === 1 ? 'avaliação' : 'avaliações'}</p>
            </div>
            <ChevronDown size={18} style={{ color: colors.textSecondary, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
        </div>
    )

    if (!open) {
        return (
            <div
                role="button"
                tabIndex={0}
                aria-label="Ver todas as avaliações"
                onClick={() => setOpen(true)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true) } }}
                className="rounded-3xl p-4 cursor-pointer transition active:scale-[0.99]"
                style={{ background: soft }}
            >
                {summary}
                {current && (
                    <div key={current.id} className="mt-3 pt-3 review-slide" style={{ borderTop: `1px solid ${colors.border}60` }}>
                        <div className="flex items-start justify-between gap-3">
                            <Reviewer r={current} colors={colors} avatar={renderAvatar(current)} linkable={false} />
                            <span className="flex items-center gap-1 text-[12px] font-black flex-shrink-0" style={{ color: current.is_liked ? '#ef4444' : colors.textSecondary }}>
                                <Heart size={13} fill={current.is_liked ? '#ef4444' : 'none'} />{current.like_count}
                            </span>
                        </div>
                        {current.comment
                            ? <p className="mt-2 text-[14px] leading-relaxed line-clamp-3" style={{ color: colors.textPrimary }}>“{current.comment}”</p>
                            : <p className="mt-2 text-[13px]" style={{ color: colors.textSecondary }}>Avaliou só com a nota.</p>}
                    </div>
                )}
                <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex gap-1.5" aria-hidden>
                        {rotating.map((r, i) => (
                            <span key={r.id} className="h-1 rounded-full transition-all" style={{ width: i === idx ? 18 : 6, background: i === idx ? ORANGE : `${colors.border}90` }} />
                        ))}
                    </div>
                    <span className="text-[12px] font-black" style={{ color: ORANGE }}>Ver todas</span>
                </div>
                <style jsx>{`
                    .review-slide { animation: reviewIn .45s ease both; }
                    @keyframes reviewIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
                    @media (prefers-reduced-motion: reduce) { .review-slide { animation: none; } }
                `}</style>
            </div>
        )
    }

    return (
        <div className="rounded-3xl p-4" style={{ background: soft }}>
            <button onClick={() => setOpen(false)} className="w-full text-left" aria-label="Recolher avaliações">{summary}</button>

            <div className="mt-3 space-y-1">
                {[5, 4, 3, 2, 1].map((star) => (
                    <div key={star} className="flex items-center gap-2 text-[10px] font-bold" style={{ color: colors.textSecondary }}>
                        <span className="w-2 text-right">{star}</span>
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: `${colors.border}60` }}>
                            <div className="h-full rounded-full" style={{ width: `${(stats[star - 1] / reviews.length) * 100}%`, background: ORANGE }} />
                        </div>
                        <span className="w-6 text-right">{stats[star - 1]}</span>
                    </div>
                ))}
            </div>

            <div className="mt-3 flex gap-1.5">
                {(['likes', 'recent'] as const).map((k) => (
                    <button key={k} onClick={() => { setSort(k); setShown(PAGE) }} className="h-8 px-3 rounded-full text-[12px] font-black transition active:scale-95"
                        style={sort === k ? { background: colors.textPrimary, color: colors.background } : { background: `${colors.border}40`, color: colors.textSecondary }}>
                        {k === 'likes' ? 'Mais curtidas' : 'Mais recentes'}
                    </button>
                ))}
            </div>

            <ul className="mt-2">
                {list.slice(0, shown).map((r) => (
                    <li key={r.id} className="py-3" style={{ borderTop: `1px solid ${colors.border}50` }}>
                        <div className="flex items-start justify-between gap-3">
                            <Reviewer r={r} colors={colors} avatar={renderAvatar(r)} />
                            <span className="text-[11px] flex-shrink-0" style={{ color: colors.textSecondary }}>
                                {new Date(r.created_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                        </div>
                        {r.comment && <p className="mt-1.5 text-[14px] leading-relaxed" style={{ color: colors.textPrimary }}>{r.comment}</p>}
                        <button
                            onClick={() => onToggleLike(r.id)}
                            aria-pressed={r.is_liked}
                            aria-label={r.is_liked ? 'Descurtir avaliação' : 'Curtir avaliação'}
                            className="mt-1.5 flex items-center gap-1 text-[12px] font-black transition active:scale-95"
                            style={{ color: r.is_liked ? '#ef4444' : colors.textSecondary }}
                        >
                            <Heart size={14} fill={r.is_liked ? '#ef4444' : 'none'} />{r.like_count}
                        </button>
                    </li>
                ))}
            </ul>

            {shown < list.length && (
                <button onClick={() => setShown((n) => n + 10)} className="mt-1 w-full h-10 rounded-full text-[13px] font-black transition active:scale-95" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>
                    Ver mais avaliações ({list.length - shown})
                </button>
            )}
            <button onClick={() => setOpen(false)} className="mt-2 w-full h-10 rounded-full text-[13px] font-black transition active:scale-95" style={{ color: colors.textSecondary }}>
                Recolher
            </button>
        </div>
    )
}
