// src/components/v3/DigitalStrip.tsx
//
// "Cursos e produtos digitais" da home 3.0: uma faixa que rola de lado, no mesmo desenho das outras vitrines (foto com o rótulo do tipo por cima, título, preço e
// o que o produto entrega). Mostra os produtos digitais ativos que já têm conteúdo, os mais vistos primeiro; "Ver tudo" abre /digitais. Sem nenhum, a seção some.
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, GraduationCap } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { loadDigitalShowcase, PRODUCT_KIND_LABEL, type ShowcaseItem } from '@/modules/digital'

const COLOR = '#0ea5e9'
const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)

export default function DigitalStrip({ className = 'mt-8' }: { className?: string }) {
    const router = useRouter()
    const { colors } = useTheme()
    const [items, setItems] = useState<ShowcaseItem[] | null>(null)

    useEffect(() => {
        let alive = true
        loadDigitalShowcase(12).then((r) => { if (alive) setItems(r) }).catch(() => { if (alive) setItems([]) })
        return () => { alive = false }
    }, [])

    if (items !== null && items.length === 0) return null
    return (
        <section className={className}>
            <div className="flex items-center gap-3 mb-3">
                <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-black leading-tight truncate" style={{ color: colors.textPrimary }}>Cursos e produtos digitais</h2>
                    <p className="text-xs truncate" style={{ color: colors.textSecondary }}>Aprenda e abra na hora, no celular</p>
                </div>
                <button onClick={() => router.push('/digitais')} className="flex items-center gap-0.5 text-xs font-black flex-shrink-0 px-3 py-1.5 rounded-full transition hover:scale-105" style={{ color: COLOR, background: `${COLOR}1a` }}>
                    Ver tudo <ChevronRight size={14} />
                </button>
            </div>
            <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-pl-4 scroll-pr-4 pb-2 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
                {items === null
                    ? [0, 1, 2].map((i) => <div key={i} className="snap-start flex-shrink-0 w-[168px] sm:w-[188px] h-[210px] rounded-3xl animate-pulse" style={{ background: `${colors.border}40` }} />)
                    : items.map((p) => (
                        <div key={p.id} role="button" tabIndex={0} onClick={() => router.push(`/${p.storeSlug}/${p.slug}`)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/${p.storeSlug}/${p.slug}`) } }}
                            className="snap-start flex-shrink-0 w-[168px] sm:w-[188px] text-left rounded-3xl overflow-hidden border flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98] cursor-pointer"
                            style={{ background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}>
                            <span className="relative block w-full h-[116px] sm:h-[128px] overflow-hidden flex-shrink-0" style={{ background: `${COLOR}22` }}>
                                {p.imageUrl ? <img src={p.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" /> : <span className="w-full h-full flex items-center justify-center" style={{ color: COLOR }}><GraduationCap size={34} /></span>}
                                <span className="absolute left-2 top-2 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full text-white" style={{ background: COLOR }}>{PRODUCT_KIND_LABEL[p.kind]}</span>
                                {p.freeItems > 0 && <span className="absolute right-2 top-2 text-[10px] font-black px-2 py-0.5 rounded-full text-white" style={{ background: '#16a34a' }}>Aula grátis</span>}
                            </span>
                            <span className="block p-3 flex-1">
                                <span className="block text-[13px] font-black leading-tight line-clamp-2" style={{ color: colors.textPrimary }}>{p.name}</span>
                                <span className="block text-[11px] leading-snug mt-1 line-clamp-2" style={{ color: colors.textSecondary }}>{p.summary}</span>
                                <span className="block text-sm font-black mt-1.5" style={{ color: '#f97316' }}>{brl(p.price)}</span>
                                <span className="block text-[10.5px] truncate" style={{ color: colors.textSecondary }}>{p.storeName}</span>
                            </span>
                        </div>
                    ))}
            </div>
        </section>
    )
}
