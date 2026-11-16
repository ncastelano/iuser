// Cartão de vitrine em linha, no estilo de app de delivery: o texto de um lado (quem vende, nome, descrição curta, preço)
// e a foto flutuando do outro. É o cartão de "Quem já oferece serviço" e de "Produtos em destaque", pra a home parecer
// uma lista de coisas e não uma parede de cartões grandes. Espaços curtos de propósito.
'use client'

import { Eye, Star } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import PlanAvatarRing from '@/components/PlanAvatarRing'

export interface ListingRowCardProps {
    title: string
    description?: string | null
    imageUrl?: string | null
    priceLabel?: string | null          // "R$ 120,00"
    priceNote?: string | null           // "por hora"
    sellerName: string
    sellerImageUrl?: string | null
    sellerId?: string | null            // pra borda do plano no avatar
    rating?: number | null
    views?: number | null
    tag?: string | null                 // etiqueta curta (tipo/categoria)
    /** Sem moldura própria: a linha vive dentro de um cartão maior (lista flutuante) */
    flat?: boolean
    onClick: () => void
}

const clean = (t?: string | null) => (t || '').replace(/\s*\n+\s*/g, ' · ').trim()

export default function ListingRowCard({ title, description, imageUrl, priceLabel, priceNote, sellerName, sellerImageUrl, sellerId, rating, views, tag, flat = false, onClick }: ListingRowCardProps) {
    const { colors } = useTheme()
    const desc = clean(description)
    // Sem foto o texto ocupa o cartão inteiro: letras maiores para o nome e o valor ganharem o destaque
    const big = !imageUrl

    return (
        <div
            onClick={onClick}
            className={'group snap-start py-3 flex items-stretch gap-3 cursor-pointer transition active:opacity-80'}
            style={{ borderBottom: `1px solid ${colors.border}50` }}
        >
            <div className={`flex-1 min-w-0 flex flex-col ${big ? 'gap-2' : 'gap-1'}`}>
                {/* Quem vende */}
                <div className="flex items-center gap-1.5 min-w-0">
                    <PlanAvatarRing userId={sellerId}>
                        <span className={`${big ? 'w-6 h-6 text-[10px]' : 'w-5 h-5 text-[9px]'} rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 font-black text-white`} style={{ background: '#f97316' }}>
                            {sellerImageUrl ? <img src={sellerImageUrl} alt="" className="w-full h-full object-cover" loading="lazy" /> : sellerName.charAt(0).toUpperCase()}
                        </span>
                    </PlanAvatarRing>
                    <span className={`${big ? 'text-xs' : 'text-[11px]'} font-bold truncate`} style={{ color: colors.textSecondary }}>{sellerName}</span>
                    {tag && <span className="text-[10px] font-black px-1.5 py-px rounded-full whitespace-nowrap flex-shrink-0" style={{ background: '#f9731618', color: '#ea580c' }}>{tag}</span>}
                </div>

                <p className={`${big ? 'text-xl line-clamp-3' : 'text-sm line-clamp-2'} font-black leading-snug`} style={{ color: colors.textPrimary }}>{title}</p>
                {desc && <p className={`${big ? 'text-sm line-clamp-3' : 'text-xs line-clamp-2'} leading-snug`} style={{ color: colors.textSecondary }}>{desc}</p>}

                <div className="mt-auto pt-1 flex items-baseline gap-1.5 flex-wrap">
                    {priceLabel && (
                        <span className={`${big ? 'text-2xl' : 'text-sm'} font-black`} style={{ color: '#f97316' }}>
                            {priceLabel}
                            {priceNote && <span className="text-[11px] font-bold" style={{ color: colors.textSecondary }}> {priceNote}</span>}
                        </span>
                    )}
                    {!!rating && rating > 0 && (
                        <span className="flex items-center gap-0.5 text-[11px] font-bold" style={{ color: colors.textPrimary }}>
                            <Star size={11} className="text-yellow-400 fill-yellow-400" />{rating.toFixed(1)}
                        </span>
                    )}
                    {!!views && views > 0 && (
                        <span className="flex items-center gap-0.5 text-[11px]" style={{ color: colors.textSecondary }}><Eye size={11} />{views}</span>
                    )}
                </div>
            </div>

            {/* Foto flutuando do lado, com sombra. Sem foto não há quadro de ícone: o texto e o valor ficam em destaque */}
            {imageUrl && (
                <div className={'relative flex-shrink-0 w-20 h-20 self-center rounded-2xl overflow-hidden'}
                    style={{ background: '#f9731620' }}>
                    <img src={imageUrl} alt={title} className="w-full h-full object-cover" loading="lazy" />
                </div>
            )}
        </div>
    )
}
