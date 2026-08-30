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

export default function CanIhelp({ dragHandle }: CanIhelpProps) {
    const { colors } = useTheme()

    return (
        <section>
            <div
                style={{
                    background: 'transparent',
                    backdropFilter: 'none',
                    WebkitBackdropFilter: 'none',
                    border: 'none',
                    boxShadow: 'none',
                    padding: 0,
                    margin: 0,
                }}
            >
                {/* Grid de categorias - sem espaçamento */}
                <div
                    className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
                    style={{
                        gap: 0,
                        margin: 0,
                        padding: 0,
                    }}
                >
                    {categorias.map((cat) => {
                        const Icon = cat.icone
                        const iconColor = cat.color || '#f97316'

                        const href = cat.slug === 'social' ? '/social' : `/lojas/${cat.slug}`

                        return (
                            <Link
                                key={cat.slug}
                                href={href}
                                className="flex flex-col items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
                                style={{
                                    aspectRatio: '1 / 1',
                                    padding: 0,
                                    margin: 0,
                                }}
                            >
                                <div
                                    className="w-3/5 h-3/5 flex items-center justify-center rounded-full transition-all duration-200 group-hover:shadow-lg"
                                    style={{
                                        background: `${iconColor}15`,
                                        padding: 0,
                                    }}
                                >
                                    <Icon
                                        className="w-full h-full object-contain"
                                        style={{ color: iconColor }}
                                        strokeWidth={1.5}
                                    />
                                </div>
                                <span
                                    className="text-[10px] font-bold text-center leading-tight"
                                    style={{
                                        color: colors.textPrimary,
                                        marginTop: 2,
                                        padding: 0,
                                    }}
                                >
                                    {cat.nome}
                                </span>
                                <span
                                    className="text-[8px] font-medium text-center opacity-60 truncate w-full"
                                    style={{
                                        color: colors.textSecondary,
                                        padding: 0,
                                        margin: 0,
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