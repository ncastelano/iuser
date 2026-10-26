// src/components/v3/RentalsPreviewCard.tsx
//
// "Buscar imóvel" da home 3.0: no mesmo estilo do "Ver ao redor", o cartão já mostra alguns imóveis para alugar (foto, preço, bairro e ficha)
// numa grade de 2 colunas, sem rolar para o lado. Tocar no título abre a busca (/imoveis); tocar num imóvel abre ele. Sem imóveis, chama
// quem tem um para anunciar. Quem ANUNCIA usa o cartão "Anunciar imóvel" (em "Quero ganhar"): são papéis diferentes.
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BedDouble, ChevronRight, Home } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { priceLabel, specsLine } from '@/modules/rentals/domain'
import { loadRentalPreview, type RentalCard } from '@/modules/rentals/load'

const COLOR = '#16a34a'

export default function RentalsPreviewCard({ title, desc }: { title: string; desc: string }) {
    const router = useRouter()
    const { colors } = useTheme()
    const [items, setItems] = useState<RentalCard[] | null>(null)
    const soft = `${colors.border}40`

    useEffect(() => {
        let alive = true
        loadRentalPreview(supabase, 4).then((r) => { if (alive) setItems(r) }).catch(() => { if (alive) setItems([]) })
        return () => { alive = false }
    }, [])

    return (
        <div className="col-span-2 md:col-span-4 rounded-3xl border" style={{ background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}>
            <button onClick={() => router.push('/imoveis')} className="w-full p-3.5 flex items-center gap-3 text-left transition active:opacity-80">
                <span className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${COLOR}1f`, color: COLOR }}><Home size={22} /></span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-black leading-tight" style={{ color: colors.textPrimary }}>{title}</span>
                    <span className="block text-xs mt-0.5 leading-snug" style={{ color: colors.textSecondary }}>{desc}</span>
                </span>
                <span className="flex items-center gap-0.5 text-xs font-black flex-shrink-0" style={{ color: COLOR }}>Ver todos <ChevronRight size={14} /></span>
            </button>

            {items === null ? (
                <div className="px-3.5 pb-3.5 grid grid-cols-2 gap-2.5">
                    {[0, 1, 2, 3].map((i) => <div key={i} className="h-[72px] rounded-2xl animate-pulse" style={{ background: soft }} />)}
                </div>
            ) : items.length === 0 ? (
                <p className="px-3.5 pb-3.5 text-xs" style={{ color: colors.textSecondary }}>Ainda não há imóveis anunciados. Tem um para alugar? Use &quot;Anunciar imóvel&quot; aqui embaixo.</p>
            ) : (
                <div className="px-3.5 pb-3.5 grid grid-cols-2 md:grid-cols-4 gap-2.5">
                    {items.map((l) => (
                        <button key={l.id} onClick={() => router.push(`/imoveis/${l.slug}`)} className="min-w-0 rounded-2xl p-2 flex items-center gap-2.5 text-left transition active:scale-[0.98]" style={{ background: soft }}>
                            <span className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: `${COLOR}22`, color: COLOR }}>
                                {l.photos[0] ? <img src={l.photos[0]} alt="" loading="lazy" className="w-full h-full object-cover" /> : <Home size={20} />}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[13px] font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{priceLabel(l)}</span>
                                <span className="block text-[11px] leading-tight truncate" style={{ color: colors.textPrimary }}>{l.title}</span>
                                <span className="block text-[10.5px] leading-tight truncate mt-0.5" style={{ color: colors.textSecondary }}>{l.neighborhood}</span>
                                {specsLine(l) && <span className="flex items-center gap-1 text-[10.5px] leading-tight truncate" style={{ color: colors.textSecondary }}><BedDouble size={10} className="flex-shrink-0" /><span className="truncate">{specsLine(l)}</span></span>}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
