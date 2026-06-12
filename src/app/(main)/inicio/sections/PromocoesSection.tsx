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
            corIcone: 'text-blue-400',
        },
        {
            titulo: '30% OFF em roupas',
            subtitulo: 'Coleção verão',
            corIcone: 'text-pink-400',
        },
        {
            titulo: 'Assinatura fitness',
            subtitulo: '1 mês grátis',
            corIcone: 'text-purple-400',
        },
    ]

    return (
        <section>
            {/* HEADER PADRONIZADO */}
            <div className="flex items-center gap-2 mb-3">
                {dragHandle}

                <h2 className="text-xl font-black text-white">Promoções</h2>

                <div
                    className="p-1.5 rounded-full"
                    style={{
                        background: 'rgba(255, 255, 255, 0.1)',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                    }}
                >
                    <TicketPercent className="w-4 h-4 text-yellow-400" />
                </div>
            </div>

            {/* CARROSSEL – VIDRO ESCURO */}
            <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
                {promocoes.map((promo, i) => (
                    <div
                        key={i}
                        className="min-w-[85%] sm:min-w-[320px] snap-center rounded-2xl p-5 text-white cursor-pointer hover:scale-[1.02] transition-transform"
                        style={{
                            background: 'rgba(255, 255, 255, 0.06)',
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                        }}
                    >
                        <p className="font-bold text-lg">{promo.titulo}</p>
                        <p className="text-sm opacity-70 mt-1">{promo.subtitulo}</p>
                    </div>
                ))}
            </div>
        </section>
    )
}