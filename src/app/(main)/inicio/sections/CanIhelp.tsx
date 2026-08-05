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
    const titleColor = colors.name === 'claro' ? '#000000' : colors.textPrimary

    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const bigint = parseInt(clean, 16)
        return {
            r: (bigint >> 16) & 255,
            g: (bigint >> 8) & 255,
            b: bigint & 255,
        }
    }
    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`

    return (
        <section>
            <div
                className="rounded-2xl p-5 flex flex-col gap-1"
                style={{
                    background: cardBg,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1px solid ${colors.border}`,
                    boxShadow: colors.shadow,
                }}
            >
                <div className="flex items-center gap-2 mb-1">
                    {dragHandle}
                    <h2
                        className="text-xl font-black"
                        style={{
                            color: titleColor,
                            textShadow: colors.name === 'claro' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                        }}
                    >
                        Posso ajudar você a encontrar algo?
                    </h2>
                </div>
                <p className="text-sm mb-3" style={{ color: colors.textSecondary }}>
                    Navegue pelas categorias e descubra lojas, serviços e muito mais.
                </p>

                {/* Grid de categorias */}
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                    {categorias.map((cat) => {
                        const Icon = cat.icone
                        // Usar a cor da categoria OU laranja como fallback
                        const iconColor = cat.color || '#f97316'

                        // Verifica se é a categoria social para usar rota especial
                        const href = cat.slug === 'social' ? '/social' : `/lojas/${cat.slug}`

                        return (
                            <Link
                                key={cat.slug}
                                href={href}
                                className="flex flex-col items-center justify-center p-1 transition-all duration-200 hover:scale-105 active:scale-95"
                                style={{
                                    aspectRatio: '1 / 1',
                                }}
                            >
                                <div
                                    className="w-3/5 h-3/5 flex items-center justify-center rounded-full p-2 transition-all duration-200 group-hover:shadow-lg"
                                    style={{
                                        background: `${iconColor}15`,
                                    }}
                                >
                                    <Icon
                                        className="w-full h-full object-contain"
                                        style={{ color: iconColor }}
                                        strokeWidth={1.5}
                                    />
                                </div>
                                <span
                                    className="text-[10px] font-bold text-center leading-tight mt-1"
                                    style={{ color: colors.textPrimary }}
                                >
                                    {cat.nome}
                                </span>
                                <span
                                    className="text-[8px] font-medium text-center opacity-60 truncate w-full px-0.5"
                                    style={{ color: colors.textSecondary }}
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