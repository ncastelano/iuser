// src/app/(main)/inicio/sections/CategoriasSection.tsx

import Link from 'next/link'
import {
    UtensilsCrossed,
    ShoppingCart,
    Pill,
    Dog,
    Dumbbell,
    Shirt,
    Package,
    PawPrint,
} from 'lucide-react'
import { ReactNode } from 'react'

interface CategoriasSectionProps {
    dragHandle?: ReactNode
}

export default function CategoriasSection({
    dragHandle,
}: CategoriasSectionProps) {
    const categorias = [
        {
            nome: 'Restaurantes',
            icone: UtensilsCrossed,
            slug: 'restaurantes',
            gradient: 'from-orange-500 to-red-500',
        },
        {
            nome: 'Mercados',
            icone: ShoppingCart,
            slug: 'mercados',
            gradient: 'from-green-500 to-emerald-600',
        },
        {
            nome: 'Farmácias',
            icone: Pill,
            slug: 'farmacias',
            gradient: 'from-yellow-400 to-red-500',
        },
        {
            nome: 'Pet Shops',
            icone: PawPrint,
            slug: 'petshops',
            gradient: 'from-pink-500 to-rose-500',
        },
        {
            nome: 'Fitness',
            icone: Dumbbell,
            slug: 'fitness',
            gradient: 'from-purple-500 to-violet-600',
        },
        {
            nome: 'Roupas',
            icone: Shirt,
            slug: 'roupas',
            gradient: 'from-blue-500 to-indigo-600',
        },

    ]

    return (
        <section>

            {/* HEADER PADRONIZADO COM DRAG */}
            <div className="flex items-center gap-2 mb-4">
                {dragHandle}

                <h2 className="text-xl font-black text-gray-800">
                    O que você busca?
                </h2>
            </div>

            {/* GRID */}
            <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-3">
                {categorias.map((cat) => (
                    <Link
                        href={`/lojas/${cat.slug}`}
                        key={cat.slug}
                        className="flex flex-col items-center gap-2 p-2 rounded-xl hover:scale-105 active:scale-95 transition-transform cursor-pointer"
                    >
                        {/* ÍCONE COM COR DINÂMICA */}
                        <div
                            className={`p-3 rounded-full bg-gradient-to-br ${cat.gradient} text-white shadow-md`}
                        >
                            <cat.icone className="w-5 h-5" />
                        </div>

                        {/* LABEL */}
                        <span className="text-xs text-center font-bold text-gray-700 leading-tight">
                            {cat.nome}
                        </span>
                    </Link>
                ))}
            </div>
        </section>
    )
}