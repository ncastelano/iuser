// src/app/(main)/inicio/sections/CanIhelp.tsx
'use client'

import Link from 'next/link'
import {
    UtensilsCrossed,
    ShoppingCart,
    Pill,
    PawPrint,
    Dumbbell,
    Shirt,
    Truck,
} from 'lucide-react'
import { ReactNode } from 'react'
import { useTheme } from '@/app/theme'

interface CanIhelpProps {
    dragHandle?: ReactNode
}

export default function CanIhelp({ dragHandle }: CanIhelpProps) {
    const { colors } = useTheme()

    // Força preto puro no tema claro para máxima legibilidade
    const titleColor = colors.name === 'claro' ? '#000000' : colors.textPrimary

    const categorias = [
        { nome: 'Restaurantes', slug: 'restaurantes', icone: UtensilsCrossed, color: '#f97316' },
        { nome: 'Mercados', slug: 'mercados', icone: ShoppingCart, color: '#22c55e' },
        { nome: 'Farmácias', slug: 'farmacias', icone: Pill, color: '#eab308' },
        { nome: 'Pet Shops', slug: 'petshops', icone: PawPrint, color: '#ec4899' },
        { nome: 'Fitness', slug: 'fitness', icone: Dumbbell, color: '#a855f7' },
        { nome: 'Roupas', slug: 'roupas', icone: Shirt, color: '#3b82f6' },
        { nome: 'Entregas', slug: 'entregas', icone: Truck, color: '#64748b' },
    ]

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

            <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-3">
                {categorias.map((cat) => (
                    <Link
                        key={cat.slug}
                        href={`/lojas/${cat.slug}`}
                        className="flex flex-col items-center gap-2 p-2 rounded-xl hover:scale-105 active:scale-95 transition-transform"
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
                            <cat.icone className="w-5 h-5" style={{ color: cat.color }} />
                        </div>

                        <span
                            className="text-xs text-center font-bold leading-tight"
                            style={{ color: colors.textPrimary }}
                        >
                            {cat.nome}
                        </span>
                    </Link>
                ))}
            </div>
        </section>
    )
}