// src/app/(main)/inicio/sections/PromocoesSection.tsx

import { ReactNode } from 'react'
import { TicketPercent } from 'lucide-react'

interface PromocoesSectionProps {
    dragHandle?: ReactNode
}

export default function PromocoesSection({
    dragHandle,
}: PromocoesSectionProps) {
    const promocoes = [
        {
            titulo: 'Frete grátis em farmácia',
            subtitulo: 'Compre acima de R$ 50',
            cor: 'from-blue-500 to-cyan-400',
        },
        {
            titulo: '30% OFF em roupas',
            subtitulo: 'Coleção verão',
            cor: 'from-pink-500 to-rose-400',
        },
        {
            titulo: 'Assinatura fitness',
            subtitulo: '1 mês grátis',
            cor: 'from-purple-500 to-violet-400',
        },
    ]

    return (
        <section>

            {/* HEADER PADRONIZADO */}
            <div className="flex items-center gap-2 mb-3">
                {dragHandle}

                <h2 className="text-xl font-black text-gray-800">
                    Promoções
                </h2>

                <div className="p-1.5 rounded-full bg-gradient-to-br from-orange-100 to-red-100">
                    <TicketPercent className="w-4 h-4 text-orange-600" />
                </div>
            </div>

            {/* CARROSSEL */}
            <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
                {promocoes.map((promo, i) => (
                    <div
                        key={i}
                        className={`min-w-[85%] sm:min-w-[320px] snap-center rounded-2xl p-5 bg-gradient-to-r ${promo.cor} text-white shadow-lg cursor-pointer hover:scale-[1.02] transition-transform`}
                    >
                        <p className="font-bold text-lg">
                            {promo.titulo}
                        </p>

                        <p className="text-sm opacity-90 mt-1">
                            {promo.subtitulo}
                        </p>
                    </div>
                ))}
            </div>
        </section>
    )
}