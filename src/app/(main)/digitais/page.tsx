// app/(main)/digitais/page.tsx — todos os produtos digitais do iUser (cursos, aulas únicas, playlists, e-books e arquivos), com busca e filtro por tipo.
// Mesma página nas duas versões da interface (na 3.0 abre dentro da casca). Tocar num produto abre a página dele; quem já comprou acha tudo em /carrinho?aba=digital.
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, GraduationCap, Search, X } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import DigitalCards from '@/components/digital/DigitalCards'
import { loadDigitalShowcase, SHOWCASE_FILTERS, type ShowcaseItem } from '@/modules/digital'

export default function DigitaisPage() {
    const { colors } = useTheme()
    const router = useRouter()
    const [items, setItems] = useState<ShowcaseItem[] | null>(null)
    const [q, setQ] = useState('')
    const [debounced, setDebounced] = useState('')
    const [filter, setFilter] = useState('todos')

    useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t) }, [q])
    useEffect(() => {
        let alive = true
        loadDigitalShowcase(100, debounced).then((r) => { if (alive) setItems(r) }).catch(() => { if (alive) setItems([]) })
        return () => { alive = false }
    }, [debounced])

    const kinds = SHOWCASE_FILTERS.find((f) => f.id === filter)?.kinds ?? null
    const shown = useMemo(() => (items || []).filter((p) => !kinds || kinds.includes(p.kind)), [items, kinds])
    const count = (id: string) => { const k = SHOWCASE_FILTERS.find((f) => f.id === id)?.kinds ?? null; return (items || []).filter((p) => !k || k.includes(p.kind)).length }

    return (
        <div className="min-h-dvh px-4 py-6 pb-28" style={{ background: colors.background, paddingTop: 'max(1.5rem, var(--shell-top, 0px))' }}>
            <div className="max-w-6xl mx-auto flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <button type="button" onClick={() => router.back()} aria-label="Voltar" className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${colors.border}40`, color: colors.textPrimary }}><ArrowLeft size={18} /></button>
                    <div className="min-w-0">
                        <h1 className="text-xl font-black leading-tight" style={{ color: colors.textPrimary }}>Cursos e produtos digitais</h1>
                        <p className="text-[12px]" style={{ color: colors.textSecondary }}>Vídeo-aulas, cursos, playlists, e-books e arquivos. Passe o mouse ou segure o dedo para ver a prévia.</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 rounded-full px-4 h-12" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                    <Search size={17} style={{ color: colors.textSecondary }} />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar curso, aula ou loja" className="flex-1 bg-transparent outline-none text-sm" style={{ color: colors.textPrimary }} />
                    {q && <button type="button" onClick={() => setQ('')} aria-label="Limpar busca" style={{ color: colors.textSecondary }}><X size={16} /></button>}
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
                    {SHOWCASE_FILTERS.map((f) => {
                        const on = filter === f.id
                        return (
                            <button key={f.id} type="button" onClick={() => setFilter(f.id)} className="h-10 px-4 rounded-full text-[13px] font-black whitespace-nowrap flex items-center gap-1.5 transition active:scale-95 flex-shrink-0"
                                style={{ background: on ? '#f97316' : colors.surface, color: on ? '#fff' : colors.textPrimary, border: `1px solid ${on ? '#f97316' : colors.border}` }}>
                                {f.label} {items && <span className="text-[11px] opacity-80">{count(f.id)}</span>}
                            </button>
                        )
                    })}
                </div>

                {items === null ? (
                    <div className="flex justify-center py-12"><Spinner size={30} color={colors.accent} /></div>
                ) : shown.length === 0 ? (
                    <div className="rounded-3xl p-8 text-center flex flex-col items-center gap-2" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                        <GraduationCap size={30} style={{ color: colors.textSecondary }} />
                        <p className="text-sm font-black" style={{ color: colors.textPrimary }}>{q || filter !== 'todos' ? 'Nada encontrado' : 'Ainda não há produtos digitais'}</p>
                        <p className="text-[12px]" style={{ color: colors.textSecondary }}>{q || filter !== 'todos' ? 'Tente outra busca ou outro filtro.' : 'Quando uma loja publicar um curso ou e-book, ele aparece aqui.'}</p>
                    </div>
                ) : (
                    <DigitalCards items={shown} layout="grid" />
                )}
            </div>
        </div>
    )
}
