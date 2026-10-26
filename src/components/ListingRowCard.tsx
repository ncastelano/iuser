// Cartão de vitrine em linha, no estilo de app de delivery: o texto de um lado (quem vende, nome, descrição curta, preço)
// e a foto flutuando do outro. É o cartão de "Quem já oferece serviço" e de "Produtos em destaque", pra a home parecer
// uma lista de coisas e não uma parede de cartões grandes. Espaços curtos de propósito.
'use client'

import { Eye, Star } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import PlanAvatarRing from '@/components/PlanAvatarRing'
import { useInsideShell } from '@/components/InsideShell'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

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
    // v3 (dentro da casca): linha corrida, sem cartão nem sombra; foto menor e quadrada
    const v3 = useInsideShell()
    const desc = clean(description)
    // Sem foto o texto ocupa o cartão inteiro: letras maiores para o nome e o valor ganharem o destaque
    const big = !imageUrl

    return (
        <div
            onClick={onClick}
            className={v3
                ? 'group snap-start py-3 flex items-stretch gap-3 cursor-pointer transition active:opacity-80'
                : flat
                ? 'group snap-start rounded-2xl px-2 py-3 flex items-stretch gap-3 cursor-pointer transition-colors duration-200 hover:bg-black/5'
                : `group snap-start rounded-3xl border ${big ? 'p-4' : 'p-3'} flex items-stretch gap-3 cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5`}
            style={v3 ? { borderBottom: `1px solid ${colors.border}50` } : flat ? undefined : { background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}
        >
            <div className={`flex-1 min-w-0 flex flex-col ${big ? 'gap-2' : 'gap-1'}`}>
                {/* Quem vende */}
                <div className="flex items-center gap-1.5 min-w-0">
                    <PlanAvatarRing userId={sellerId}>
                        <span className={`${big ? 'w-6 h-6 text-[10px]' : 'w-5 h-5 text-[9px]'} rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 font-black text-white`} style={{ background: v3 ? '#f97316' : GRADIENT }}>
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
                <div className={v3 ? 'relative flex-shrink-0 w-20 h-20 self-center rounded-2xl overflow-hidden' : 'relative flex-shrink-0 w-24 h-24 self-center rounded-2xl overflow-hidden transition-transform duration-300 group-hover:scale-105'}
                    style={v3 ? { background: '#f9731620' } : { background: GRADIENT, boxShadow: '0 8px 18px rgba(0,0,0,0.22)' }}>
                    <img src={imageUrl} alt={title} className="w-full h-full object-cover" loading="lazy" />
                </div>
            )}
        </div>
    )
}
