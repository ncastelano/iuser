// src/components/rentals/RentalCardView.tsx
//
// O cartão de um imóvel na busca (e em "Meus imóveis"): foto grande, o preço com o TOTAL do mês (aluguel + condomínio + IPTU), a ficha,
// o lugar (só bairro e cidade) e o selo do anunciante. Só apresentação.
'use client'

import { BedDouble, Building2, Home, MapPin, PawPrint, Share2, Sofa } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { brl, monthlyTotal, priceLabel, propertyLabel, specsLine } from '@/modules/rentals/domain'
import type { RentalCard } from '@/modules/rentals/load'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export default function RentalCardView({ l, onOpen, onShare, trailing }: { l: RentalCard; onOpen: () => void; onShare?: () => void; trailing?: React.ReactNode }) {
    const { colors } = useTheme()
    const total = monthlyTotal(l)
    const photo = l.photos[0]
    const specs = specsLine(l)
    return (
        <div className="rounded-3xl overflow-hidden" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            <button onClick={onOpen} className="relative block w-full aspect-[16/10] overflow-hidden text-left" style={{ background: GRADIENT }} aria-label={`Ver ${l.title}`}>
                {photo
                    ? <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                    : <span className="absolute inset-0 flex items-center justify-center text-white/90"><Home size={42} /></span>}
                <span className="absolute left-3 top-3 flex gap-1.5 flex-wrap">
                    <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full text-white" style={{ background: 'rgba(0,0,0,0.62)' }}>{propertyLabel(l.propertyType)}</span>
                    {l.rentalKind === 'temporada' && <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full text-white" style={{ background: '#7c3aed' }}>Temporada</span>}
                    {l.storeId && <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full text-white flex items-center gap-1" style={{ background: '#2563eb' }}><Building2 size={10} /> Imobiliária</span>}
                    {l.status !== 'active' && <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full text-white" style={{ background: l.status === 'rented' ? '#16a34a' : '#6b7280' }}>{l.status === 'rented' ? 'Alugado' : 'Pausado'}</span>}
                </span>
                {l.photos.length > 1 && <span className="absolute right-3 bottom-3 text-[10px] font-black px-2 py-1 rounded-full text-white" style={{ background: 'rgba(0,0,0,0.62)' }}>{l.photos.length} fotos</span>}
            </button>
            <div className="p-3.5 flex flex-col gap-1.5">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="text-xl font-black leading-tight" style={{ color: colors.textPrimary }}>{priceLabel(l)}</p>
                        {total != null && (l.condoFee > 0 || l.iptuFee > 0) && <p className="text-[11px]" style={{ color: colors.textSecondary }}>Total com condomínio e IPTU: <b>{brl(total)}</b>/mês</p>}
                    </div>
                    {onShare && <button onClick={onShare} aria-label="Compartilhar imóvel" className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${colors.border}40`, color: colors.textPrimary }}><Share2 size={16} style={{ color: '#f97316' }} /></button>}
                </div>
                <button onClick={onOpen} className="text-left">
                    <span className="block text-[15px] font-black leading-snug" style={{ color: colors.textPrimary, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{l.title}</span>
                </button>
                {specs && <p className="flex items-center gap-1.5 text-[12px]" style={{ color: colors.textSecondary }}><BedDouble size={13} className="flex-shrink-0" />{specs}</p>}
                <p className="flex items-center gap-1.5 text-[12px]" style={{ color: colors.textSecondary }}><MapPin size={13} className="flex-shrink-0" />{l.neighborhood}, {l.city}</p>
                {(l.petsAllowed || l.furnished) && (
                    <div className="flex gap-1.5 mt-0.5">
                        {l.petsAllowed && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: `${colors.border}40`, color: colors.textPrimary }}><PawPrint size={11} /> Aceita pet</span>}
                        {l.furnished && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: `${colors.border}40`, color: colors.textPrimary }}><Sofa size={11} /> Mobiliado</span>}
                    </div>
                )}
                {trailing}
            </div>
        </div>
    )
}
