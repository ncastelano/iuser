// src/app/(main)/inicio/sections/CanIhelp.tsx
'use client'

import Link from 'next/link'
import { ReactNode } from 'react'
import { useTheme } from '@/app/theme'
import { categorias } from '@/lib/categorias'

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

export default function CanIhelp({ dragHandle }: CanIhelpProps) {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`

    return (
        <section>
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
                {/* Grid de categorias - apenas os cards pequenos coloridos */}
                <div
                    className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4"
                >
                    {categorias.map((cat) => {
                        const Icon = cat.icone
                        const iconColor = cat.color || '#f97316'

                        const href = cat.slug === 'social' ? '/social' : cat.slug === 'comunidades' ? '/comunidade' : `/lojas/${cat.slug}`

                        return (
                            <Link
                                key={cat.slug}
                                href={href}
                                className="flex flex-col items-center justify-center p-3 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 group"
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