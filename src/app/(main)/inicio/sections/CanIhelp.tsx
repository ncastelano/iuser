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

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {categorias.map((cat) => {
                    const Icon = cat.icone
                    return (
                        <Link
                            key={cat.slug}
                            href={`/lojas/${cat.slug}`}
                            className="flex flex-col items-center gap-2 p-3 rounded-xl hover:scale-105 active:scale-95 transition-transform"
                        >
                            <div
                                className="p-3 rounded-full shadow-md"
                                style={{
                                    background: colors.surface,
                                    backdropFilter: 'blur(10px)',
                                    WebkitBackdropFilter: 'blur(10px)',
                                    border: `1px solid ${colors.border}`,
                                }}
                            >
                                <Icon className="w-5 h-5" style={{ color: cat.color }} />
                            </div>

                            <div className="text-center">
                                <span
                                    className="text-xs font-bold block leading-tight"
                                    style={{ color: colors.textPrimary }}
                                >
                                    {cat.nome}
                                </span>
                                <span
                                    className="text-[10px] font-medium block mt-0.5 opacity-70"
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