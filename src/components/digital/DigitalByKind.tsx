'use client'

// src/components/digital/DigitalByKind.tsx — a vitrine digital da HOME (2.0 e 3.0) SEPARADA POR TIPO: uma fileira de abas com as prateleiras que
// existem (Cursos e aulas · Músicas e álbuns · Audiolivros · Podcasts · Filmes e vídeos · E-books e arquivos · Programas, a mesma lista da
// página da loja, `SHELVES`), com a contagem, e embaixo a fileira de cartões (com prévia) SÓ daquele tipo. "Ver todos" abre /digitais já
// no filtro do tipo (`?tipo=<id>`). Antes tudo vinha misturado numa fileira só.
import { useMemo, useState } from 'react'
import { useTheme } from '@/app/contexts/theme'
import DigitalCards from './DigitalCards'
import { groupIntoShelves, type ShowcaseItem } from '@/modules/digital'

export default function DigitalByKind({ items, color = '#0ea5e9', onSeeAll }: { items: ShowcaseItem[]; color?: string; onSeeAll: (tipo: string) => void }) {
    const { colors } = useTheme()
    const shelves = useMemo(() => groupIntoShelves(items), [items])
    const [picked, setPicked] = useState<string | null>(null)
    const cur = shelves.find((s) => s.id === picked) ?? shelves[0]
    if (!cur) return null
    return (
        <div>
            {shelves.length > 1 && (
                <div role="tablist" className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scroll-pl-4 scroll-pr-4" style={{ scrollbarWidth: 'none' }}>
                    {shelves.map((s) => {
                        const on = s.id === cur.id
                        return (
                            <button key={s.id} role="tab" aria-selected={on} type="button" onClick={() => setPicked(s.id)}
                                className="h-9 px-3.5 rounded-full text-[12.5px] font-black whitespace-nowrap flex items-center gap-1.5 flex-shrink-0 transition active:scale-95"
                                style={on ? { background: color, color: '#fff', border: `1px solid ${color}` } : { background: 'transparent', color: colors.textPrimary, border: `1px solid ${colors.border}` }}>
                                {s.title}<span className="text-[11px] opacity-75">{s.items.length}</span>
                            </button>
                        )
                    })}
                </div>
            )}
            <DigitalCards key={cur.id} items={cur.items} layout="strip" />
            {cur.items.length > 1 && (
                <button type="button" onClick={() => onSeeAll(cur.id === 'outros' ? 'todos' : cur.id)} className="mt-1 text-[12px] font-black" style={{ color }}>
                    Ver todos de {cur.title.toLowerCase()} →
                </button>
            )}
        </div>
    )
}
