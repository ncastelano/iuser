// src/app/(main)/inicio/sections/CanIhelp.tsx
'use client'

import Link from 'next/link'
import { ReactNode, useEffect, useState } from 'react'
import { useTheme } from '@/app/contexts/theme'
import { categorias, type Categoria } from '@/lib/categorias'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { hexToRgb } from '@/lib/color'
import { supabase } from '@/lib/supabase/client'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface CanIhelpProps {
    dragHandle?: ReactNode
}

// ===== Contagem de cliques por categoria, salva no navegador =====
const CLICKS_STORAGE_KEY = 'iuser-category-clicks'

function getClickCounts(): Record<string, number> {
    if (typeof window === 'undefined') return {}
    try {
        return JSON.parse(localStorage.getItem(CLICKS_STORAGE_KEY) || '{}')
    } catch {
        return {}
    }
}

function bumpClickCount(slug: string) {
    if (typeof window === 'undefined') return
    try {
        const counts = getClickCounts()
        counts[slug] = (counts[slug] || 0) + 1
        localStorage.setItem(CLICKS_STORAGE_KEY, JSON.stringify(counts))
    } catch {
        // localStorage indisponível (modo privado, etc.) - ignora
    }
}

// ===== Badges de contagem já dispensados, salvo no navegador =====
// Uma vez que a pessoa clica no número (já viu quantas lojas tem ali), o
// badge some daquela categoria pra sempre nesse aparelho — só serve pra
// chamar atenção na primeira vez.
const DISMISSED_BADGES_KEY = 'iuser-category-badges-dismissed'

function getDismissedBadges(): Set<string> {
    if (typeof window === 'undefined') return new Set()
    try {
        const raw = JSON.parse(localStorage.getItem(DISMISSED_BADGES_KEY) || '[]')
        return new Set(Array.isArray(raw) ? raw : [])
    } catch {
        return new Set()
    }
}

function dismissBadge(slug: string) {
    if (typeof window === 'undefined') return
    try {
        const dismissed = getDismissedBadges()
        dismissed.add(slug)
        localStorage.setItem(DISMISSED_BADGES_KEY, JSON.stringify(Array.from(dismissed)))
    } catch {
        // localStorage indisponível (modo privado, etc.) - ignora
    }
}

export default function CanIhelp({ dragHandle }: CanIhelpProps) {
    const { colors } = useTheme()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`

    // Ordem inicial = ordem padrão (evita divergência de hidratação); depois
    // do mount, reordena da categoria mais clicada pra menos clicada.
    const [orderedCategorias, setOrderedCategorias] = useState<Categoria[]>(categorias)

    useEffect(() => {
        const counts = getClickCounts()
        const sorted = [...categorias].sort(
            (a, b) => (counts[b.slug] || 0) - (counts[a.slug] || 0)
        )
        setOrderedCategorias(sorted)
    }, [])

    // ===== Contagem de lojas por categoria (badge) =====
    const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({})
    const [dismissedBadges, setDismissedBadges] = useState<Set<string>>(new Set())

    useEffect(() => {
        setDismissedBadges(getDismissedBadges())

        supabase
            .from('stores')
            .select('category')
            .eq('is_active', true)
            .then(({ data }) => {
                if (!data) return
                const counts: Record<string, number> = {}
                for (const row of data as { category: string | null }[]) {
                    if (!row.category) continue
                    counts[row.category] = (counts[row.category] || 0) + 1
                }
                setCategoryCounts(counts)
            })
    }, [])

    const handleDismissBadge = (e: React.MouseEvent, slug: string) => {
        e.preventDefault()
        e.stopPropagation()
        dismissBadge(slug)
        setDismissedBadges((prev) => new Set(prev).add(slug))
    }

    return (
        <section>
            <div className="flex items-center gap-2 mb-4">
                {dragHandle}
                <h2 className="text-lg font-bold" style={{ color: colors.textPrimary }}>
                    Categorias
                </h2>
            </div>

            <div
                className="rounded-2xl p-6"
                style={{
                    background: cardBg,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1px solid ${colors.border}`,
                    boxShadow: colors.shadow,
                    transform: 'translateZ(0)',
                    willChange: 'transform',
                }}
            >
                {/* Lista de categorias em wrap - a mais clicada fica primeiro */}
                <div className="flex flex-wrap gap-3 justify-center">
                    {orderedCategorias.map((cat) => {
                        const Icon = cat.icone
                        const iconColor = cat.color || '#f97316'

                        const href = cat.slug === 'social' ? '/social' : cat.slug === 'comunidades' ? '/comunidade' : `/lojas/${cat.slug}`

                        const count = categoryCounts[cat.nome] || 0
                        const showBadge = count > 0 && !dismissedBadges.has(cat.slug)

                        return (
                            <Link
                                key={cat.slug}
                                href={href}
                                onClick={() => {
                                    bumpClickCount(cat.slug)
                                    startNavProgress()
                                }}
                                className="relative flex flex-col items-center justify-center p-3 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 group flex-shrink-0 w-20"
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                }}
                            >
                                <div className="relative">
                                    <div
                                        className="w-14 h-14 flex items-center justify-center rounded-full transition-all duration-200 group-hover:shadow-lg"
                                        style={{
                                            background: `${iconColor}20`,
                                        }}
                                    >
                                        <Icon
                                            className="w-7 h-7"
                                            style={{ color: iconColor }}
                                            strokeWidth={1.5}
                                        />
                                    </div>

                                    {showBadge && (
                                        <button
                                            onClick={(e) => handleDismissBadge(e, cat.slug)}
                                            className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center gap-0.5 text-white text-[10px] font-black leading-none animate-badge-pop"
                                            style={{ background: GRADIENT, border: `2px solid ${colors.surface}` }}
                                            title="Marcar como visto"
                                        >
                                            {count}
                                        </button>
                                    )}
                                </div>
                                <span
                                    className="text-[10px] font-bold text-center leading-tight mt-2"
                                    style={{
                                        color: colors.textPrimary,
                                    }}
                                >
                                    {cat.nome}
                                </span>
                                <span
                                    className="text-[8px] font-medium text-center opacity-60 truncate w-full"
                                    style={{
                                        color: colors.textPrimary,
                                    }}
                                >
                                    {cat.desc}
                                </span>
                            </Link>
                        )
                    })}
                </div>
            </div>

            <style jsx>{`
                @keyframes badge-pop {
                    0% { transform: scale(0.6); opacity: 0; }
                    60% { transform: scale(1.15); opacity: 1; }
                    100% { transform: scale(1); opacity: 1; }
                }
                .animate-badge-pop {
                    animation: badge-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
                }
            `}</style>
        </section>
    )
}
