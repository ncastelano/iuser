// src/app/(main)/inicio/sections/CategoriasSection.tsx

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

interface CategoriasSectionProps {
    dragHandle?: ReactNode
}

export default function CategoriasSection({ dragHandle }: CategoriasSectionProps) {

    const categorias = [
        {
            nome: 'Restaurantes',
            slug: 'restaurantes',
            icone: UtensilsCrossed,
            gradient: 'from-orange-500 to-red-500',
        },
        {
            nome: 'Mercados',
            slug: 'mercados',
            icone: ShoppingCart,
            gradient: 'from-green-500 to-emerald-600',
        },
        {
            nome: 'Farmácias',
            slug: 'farmacias',
            icone: Pill,
            gradient: 'from-yellow-400 to-red-500',
        },
        {
            nome: 'Pet Shops',
            slug: 'petshops',
            icone: PawPrint,
            gradient: 'from-pink-500 to-rose-500',
        },
        {
            nome: 'Fitness',
            slug: 'fitness',
            icone: Dumbbell,
            gradient: 'from-purple-500 to-violet-600',
        },
        {
            nome: 'Roupas',
            slug: 'roupas',
            icone: Shirt,
            gradient: 'from-blue-500 to-indigo-600',
        },
        {
            nome: 'Entregas',
            slug: 'entregas',
            icone: Truck,
            gradient: 'from-slate-600 to-gray-800',
        },
    ]

    return (
        <section>
            {/* HEADER */}
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
                        key={cat.slug}
                        href={`/lojas/${cat.slug}`}
                        className="flex flex-col items-center gap-2 p-2 rounded-xl hover:scale-105 active:scale-95 transition-transform"
                    >
                        <div
                            className={`p-3 rounded-full bg-gradient-to-br ${cat.gradient} text-white shadow-md`}
                        >
                            <cat.icone className="w-5 h-5" />
                        </div>

                        <span className="text-xs text-center font-bold text-gray-700 leading-tight">
                            {cat.nome}
                        </span>
                    </Link>
                ))}
            </div>
        </section>
    )
}