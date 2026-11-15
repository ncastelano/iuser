// src/app/(main)/inicio/SearchResultsSection.tsx
//
// Resultados da busca da home (2.0 e 3.0): procura em TUDO que existe no iUser (lojas, pessoas, produtos, serviços, publicações, digitais,
// imóveis, pedidos de serviço, flashes e comunidades) pela função `search_all` do banco (sem acento, só campos públicos).
// "Tudo" mostra os primeiros de cada tipo; uma fileira de filtros (com a contagem) leva a um tipo só, com mais resultados.
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ChevronRight } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { addRecentClick } from '@/components/LastSearched'
import MiniEntityCard from '@/components/MiniEntityCard'
import { trackProfileVisit } from '@/lib/trackProfileVisit'
import { groupHits, hitImageUrl, RESULT_INFO, searchEverything, totalOf, type HitGroup, type ResultKind, type SearchHit } from '@/modules/search'

interface SearchResultsSectionProps {
    searchQuery: string
    onSearchSelect?: (query: string) => void
}

const PER_KIND = 4        // quantos de cada tipo aparecem em "Tudo"
const PER_KIND_ALONE = 30 // quantos quando a pessoa escolhe um tipo só

/** Linha de resultado (produto, serviço, publicação, digital, imóvel, pedido, flash, comunidade) */
function HitRow({ hit, onOpen }: { hit: SearchHit; onOpen: (h: SearchHit) => void }) {
    const { colors } = useTheme()
    const info = RESULT_INFO[hit.kind]
    const img = hitImageUrl(hit)
    return (
        <button onClick={() => onOpen(hit)} className="w-full flex items-center gap-3 p-2.5 rounded-2xl text-left transition active:scale-[0.99]" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            <span className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center text-white text-lg font-black" style={{ background: `linear-gradient(135deg, ${info.color}, ${info.color}aa)` }}>
                {hit.title.charAt(0).toUpperCase()}
                {img && <img src={img} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-black leading-snug line-clamp-2" style={{ color: colors.textPrimary }}>{hit.title}</span>
                {hit.subtitle && <span className="block text-[12px] truncate" style={{ color: colors.textSecondary }}>{hit.subtitle}</span>}
            </span>
            <span className="flex flex-col items-end gap-1 flex-shrink-0">
                {hit.extra && <span className="text-[12px] font-black" style={{ color: info.color }}>{hit.extra}</span>}
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: `${info.color}1f`, color: info.color }}>{info.label}</span>
            </span>
        </button>
    )
}

export default function SearchResultsSection({ searchQuery }: SearchResultsSectionProps) {
    const { colors } = useTheme()
    const { userId: viewerId } = useProfile()
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [failed, setFailed] = useState(false)
    const [groups, setGroups] = useState<HitGroup[]>([])           // resultado de "Tudo" (e as contagens dos filtros)
    const [only, setOnly] = useState<ResultKind | null>(null)      // tipo escolhido na fileira de filtros
    const [onlyHits, setOnlyHits] = useState<SearchHit[] | null>(null)
    const [displayQuery, setDisplayQuery] = useState('')
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        const trimmed = searchQuery.trim()
        setDisplayQuery(trimmed)
        setOnly(null)
        setOnlyHits(null)
        if (timer.current) { clearTimeout(timer.current); timer.current = null }
        if (!trimmed) { setGroups([]); setLoading(false); setFailed(false); return }
        setLoading(true)
        let alive = true
        timer.current = setTimeout(async () => {
            const hits = await searchEverything(trimmed, PER_KIND)
            if (!alive) return
            setFailed(hits === null)
            setGroups(hits ? groupHits(hits) : [])
            setLoading(false)
        }, 300)
        return () => { alive = false; if (timer.current) { clearTimeout(timer.current); timer.current = null } }
    }, [searchQuery])

    // escolheu um tipo: busca mais resultados só dele
    useEffect(() => {
        if (!only || !displayQuery) { setOnlyHits(null); return }
        let alive = true
        setOnlyHits(null)
        void searchEverything(displayQuery, PER_KIND_ALONE, only).then((h) => { if (alive) setOnlyHits(h || []) })
        return () => { alive = false }
    }, [only, displayQuery])

    const open = (hit: SearchHit) => {
        if (hit.kind === 'loja' || hit.kind === 'pessoa' || hit.kind === 'produto' || hit.kind === 'servico') {
            addRecentClick({
                type: hit.kind === 'loja' ? 'store' : hit.kind === 'pessoa' ? 'profile' : 'product', id: hit.id, name: hit.title, imageUrl: hitImageUrl(hit), url: hit.href,
                ...(hit.kind === 'produto' || hit.kind === 'servico' ? { storeName: hit.subtitle.replace(/^em /, '') } : {}),
            })
        }
        router.push(hit.href)
    }

    const total = useMemo(() => totalOf(groups), [groups])
    const shown: HitGroup[] = only ? (onlyHits ? groupHits(onlyHits) : []) : groups

    if (!displayQuery) return null

    const renderGroup = (g: HitGroup) => {
        const info = RESULT_INFO[g.kind]
        const isCards = g.kind === 'loja' || g.kind === 'pessoa'
        return (
            <section key={g.kind} aria-label={info.plural}>
                <div className="flex items-center gap-2 mb-2.5">
                    <span className="text-xs font-black uppercase tracking-wider" style={{ color: info.color }}>{info.plural}</span>
                    <span className="text-[10px] font-bold opacity-60" style={{ color: info.color }}>({g.total})</span>
                    {!only && g.total > g.hits.length && (
                        <button onClick={() => setOnly(g.kind)} className="ml-auto flex items-center gap-0.5 text-[12px] font-black" style={{ color: info.color }}>Ver todos <ChevronRight size={14} /></button>
                    )}
                </div>
                {isCards ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {g.hits.map((h) => (
                            <MiniEntityCard
                                key={h.id}
                                kind={h.kind === 'loja' ? 'store' : 'profile'}
                                name={h.title}
                                slug={h.href.slice(1).split('?')[0] || null}
                                imageUrl={hitImageUrl(h)}
                                profileId={h.kind === 'pessoa' ? h.id : null}
                                colors={colors}
                                onClick={() => open(h)}
                                onHover={h.kind === 'pessoa' ? () => { trackProfileVisit(h.id, viewerId) } : undefined}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">{g.hits.map((h) => <HitRow key={h.id} hit={h} onOpen={open} />)}</div>
                )}
            </section>
        )
    }

    return (
        <section>
            <div className="flex items-center gap-2 mb-3">
                <h2 className="text-xl font-black min-w-0 truncate" style={{ color: colors.textPrimary }}>Resultados para "{displayQuery}"</h2>
                {!loading && total > 0 && <span className="text-xs font-bold px-2 py-1 rounded-full flex-shrink-0" style={{ background: '#f9731620', color: '#f97316' }}>{total} resultados</span>}
            </div>

            {/* Filtro por tipo, numa linha só (rola pro lado) */}
            {!loading && groups.length > 1 && (
                <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-3" style={{ WebkitOverflowScrolling: 'touch' }}>
                    <button onClick={() => setOnly(null)} className="flex-shrink-0 h-9 px-3.5 rounded-full text-[12px] font-black whitespace-nowrap" style={!only ? { background: '#f97316', color: '#fff' } : { background: `${colors.border}40`, color: colors.textPrimary }}>Tudo</button>
                    {groups.map((g) => {
                        const info = RESULT_INFO[g.kind]
                        const on = only === g.kind
                        return (
                            <button key={g.kind} onClick={() => setOnly(g.kind)} className="flex-shrink-0 h-9 px-3.5 rounded-full text-[12px] font-black whitespace-nowrap" style={on ? { background: info.color, color: '#fff' } : { background: `${colors.border}40`, color: colors.textPrimary }}>
                                {info.plural} <span className="opacity-70">{g.total}</span>
                            </button>
                        )
                    })}
                </div>
            )}

            {loading && <div className="flex justify-center py-12"><Spinner size={24} color={colors.accent} /></div>}

            {!loading && failed && (
                <div className="rounded-2xl p-6 text-center text-sm" style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textSecondary }}>Não foi possível buscar agora. Tente de novo em instantes.</div>
            )}

            {!loading && !failed && groups.length === 0 && (
                <div className="rounded-2xl p-6 flex flex-col items-center gap-3 text-center" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                    <Search className="w-8 h-8" style={{ color: colors.textPrimary }} />
                    <p className="text-sm font-medium" style={{ color: colors.textPrimary }}>Nenhum resultado encontrado para "{displayQuery}".</p>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Tente outra palavra ou verifique a ortografia. Procuramos em lojas, pessoas, produtos, serviços, publicações, imóveis, pedidos, flashes e comunidades.</p>
                </div>
            )}

            {!loading && groups.length > 0 && (
                <div className="space-y-6">
                    {only && onlyHits === null ? <div className="flex justify-center py-10"><Spinner size={22} color={colors.accent} /></div> : shown.map(renderGroup)}
                </div>
            )}
        </section>
    )
}
