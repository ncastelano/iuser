// src/app/(main)/inicio/sections/CanIhelp.tsx
'use client'

import Link from 'next/link'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { useTheme } from '@/app/theme'
import { categorias, type Categoria } from '@/lib/categorias'
import { useNavProgressStore } from '@/store/useNavProgressStore'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface CanIhelpProps {
    dragHandle?: ReactNode
}

function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255,
    }
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

    // Só centraliza a lista quando ela cabe inteira no card; caso contrário
    // (ex: mobile) mantém alinhada ao início, senão o justify-center corta o
    // primeiro item porque o overflow negativo do flex vira inacessível.
    const scrollRef = useRef<HTMLDivElement>(null)
    const [fitsWithoutScroll, setFitsWithoutScroll] = useState(true)

    useEffect(() => {
        const el = scrollRef.current
        if (!el) return

        const checkFit = () => setFitsWithoutScroll(el.scrollWidth <= el.clientWidth + 1)
        checkFit()

        const resizeObserver = new ResizeObserver(checkFit)
        resizeObserver.observe(el)
        return () => resizeObserver.disconnect()
    }, [orderedCategorias])

    // Permite arrastar a lista com o mouse no PC, como um swipe de dedo
    const dragRef = useRef({ isDown: false, startX: 0, startScrollLeft: 0, moved: false })

    const handleDragStart = (clientX: number) => {
        const el = scrollRef.current
        if (!el) return
        dragRef.current = { isDown: true, startX: clientX, startScrollLeft: el.scrollLeft, moved: false }
    }

    const handleDragMove = (clientX: number) => {
        const el = scrollRef.current
        if (!el || !dragRef.current.isDown) return
        const walk = clientX - dragRef.current.startX
        if (Math.abs(walk) > 5) dragRef.current.moved = true
        el.scrollLeft = dragRef.current.startScrollLeft - walk
    }

    const handleDragEnd = () => {
        dragRef.current.isDown = false
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
                {/* Lista de categorias em scroll horizontal - a mais clicada fica à esquerda */}
                <div
                    ref={scrollRef}
                    className={`flex gap-3 overflow-x-auto pb-1 px-1 scrollbar-hide cursor-grab active:cursor-grabbing select-none ${fitsWithoutScroll ? 'justify-center' : 'justify-start'
                        }`}
                    onMouseDown={(e) => handleDragStart(e.pageX)}
                    onMouseMove={(e) => handleDragMove(e.pageX)}
                    onMouseUp={handleDragEnd}
                    onMouseLeave={handleDragEnd}
                >
                    {orderedCategorias.map((cat) => {
                        const Icon = cat.icone
                        const iconColor = cat.color || '#f97316'

                        const href = cat.slug === 'social' ? '/social' : cat.slug === 'comunidades' ? '/comunidade' : `/lojas/${cat.slug}`

                        return (
                            <Link
                                key={cat.slug}
                                href={href}
                                draggable={false}
                                onClick={(e) => {
                                    if (dragRef.current.moved) {
                                        e.preventDefault()
                                        return
                                    }
                                    bumpClickCount(cat.slug)
                                    startNavProgress()
                                }}
                                className="flex flex-col items-center justify-center p-3 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 group flex-shrink-0 w-20"
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                }}
                            >
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
                                        color: colors.textSecondary,
                                    }}
                                >
                                    {cat.desc}
                                </span>
                            </Link>
                        )
                    })}
                </div>
            </div>
        </section>
    )
}
