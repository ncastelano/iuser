// src/app/(main)/inicio/sections/CanIhelp.tsx
'use client'

import Link from 'next/link'
import { ReactNode } from 'react'
import { useTheme } from '@/app/theme'
import { categorias } from '@/lib/categorias'

interface CanIhelpProps {
    dragHandle?: ReactNode
}

export default function CanIhelp({ dragHandle }: CanIhelpProps) {
    const { colors } = useTheme()
    const titleColor = colors.name === 'claro' ? '#000000' : colors.textPrimary

    return (
        <section>
            <div className="flex items-center gap-2 mb-4">
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

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                {categorias.map((cat) => {
                    const Icon = cat.icone
                    return (
                        <Link
                            key={cat.slug}
                            href={`/lojas/${cat.slug}`}
                            className="group relative flex items-center justify-center rounded-xl overflow-hidden transition-all duration-200 hover:scale-105 active:scale-95"
                            style={{
                                background: colors.surface,
                                border: `1px solid ${colors.border}`,
                                boxShadow: colors.shadow,
                                aspectRatio: '1 / 1', // card quadrado
                            }}
                        >
                            {/* Ícone grande ocupando todo o card */}
                            <Icon
                                className="w-4/5 h-4/5 object-contain"
                                style={{ color: cat.color }}
                                strokeWidth={1.5}
                            />

                            {/* Texto sobreposto na parte inferior com fundo suave */}
                            <div
                                className="absolute bottom-0 left-0 right-0 px-1 py-1.5 text-center"
                                style={{
                                    background: `linear-gradient(transparent, ${colors.surface}cc)`,
                                    backdropFilter: 'blur(4px)',
                                    WebkitBackdropFilter: 'blur(4px)',
                                }}
                            >
                                <span
                                    className="text-[10px] font-bold block leading-tight"
                                    style={{ color: colors.textPrimary }}
                                >
                                    {cat.nome}
                                </span>
                                <span
                                    className="text-[8px] font-medium block opacity-70 truncate"
                                    style={{ color: colors.textSecondary }}
                                >
                                    {cat.desc}
                                </span>
                            </div>
                        </Link>
                    )
                })}
            </div>
        </section>
    )
}