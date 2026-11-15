// src/components/search/SearchSuggestions.tsx
//
// O que aparece quando a pessoa toca na busca e ainda não digitou nada: as ÚLTIMAS buscas dela (neste aparelho) e o que está EM ALTA —
// no iUser todo, na cidade, no estado e entre quem ela segue (só termos buscados por várias pessoas; ninguém é identificado).
// Tocar numa sugestão preenche a busca. Cada lista de "em alta" some se vier vazia; sem nada para mostrar, uma dica curta.
'use client'

import { useEffect, useState } from 'react'
import { Clock, Flame, Landmark, MapPin, Search, Users, X, type LucideIcon } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { clearSearches, forgetSearch, getRecent, loadTrends, peopleLabel, trendSection, TREND_SCOPES, type Trend, type TrendScope } from '@/modules/search'

const SCOPE_UI: Record<TrendScope, { icon: LucideIcon; color: string }> = {
    global:    { icon: Flame,    color: '#f97316' },
    city:      { icon: MapPin,   color: '#2563eb' },
    state:     { icon: Landmark, color: '#16a34a' },
    following: { icon: Users,    color: '#7c3aed' },
}
const RANK_BG = ['#eab308', '#94a3b8', '#d97706']   // ouro, prata, bronze nos 3 primeiros

function Head({ icon: Icon, color, title, subtitle }: { icon: LucideIcon; color: string; title: string; subtitle?: string }) {
    const { colors } = useTheme()
    return (
        <div className="flex items-center gap-2 mb-2">
            <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${color}1f`, color }}><Icon size={15} /></span>
            <div className="min-w-0">
                <p className="text-[14px] font-black leading-tight" style={{ color: colors.textPrimary }}>{title}</p>
                {subtitle && <p className="text-[11px] leading-tight" style={{ color: colors.textSecondary }}>{subtitle}</p>}
            </div>
        </div>
    )
}

export default function SearchSuggestions({ loggedIn, onPick }: { loggedIn: boolean; onPick: (term: string) => void }) {
    const { colors } = useTheme()
    const [recent, setRecent] = useState<string[]>([])
    const [trends, setTrends] = useState<Partial<Record<TrendScope, Trend[] | null>>>({})
    const [loaded, setLoaded] = useState(false)

    useEffect(() => {
        setRecent(getRecent())
        let alive = true
        void Promise.all(TREND_SCOPES.map(async (s) => [s, await loadTrends(s)] as const)).then((rows) => {
            if (!alive) return
            setTrends(Object.fromEntries(rows))
            setLoaded(true)
        })
        return () => { alive = false }
    }, [])

    const pick = (t: string) => onPick(t)
    const shown = TREND_SCOPES.filter((s) => (trends[s]?.length || 0) > 0)
    const nothing = loaded && recent.length === 0 && shown.length === 0

    return (
        // não deixa o campo de busca perder o foco ao tocar aqui (senão a lista fecha antes do toque valer)
        <div className="flex flex-col gap-6" onMouseDown={(e) => e.preventDefault()}>
            {recent.length > 0 && (
                <section aria-label="Suas últimas buscas">
                    <div className="flex items-start justify-between gap-2">
                        <Head icon={Clock} color={colors.textSecondary} title="Suas últimas buscas" />
                        <button onClick={() => setRecent(clearSearches(loggedIn))} className="flex-shrink-0 text-[12px] font-black px-2.5 h-7 rounded-full" style={{ background: `${colors.border}40`, color: colors.textSecondary }}>Limpar</button>
                    </div>
                    <ul className="flex flex-col">
                        {recent.slice(0, 6).map((t) => (
                            <li key={t} className="flex items-center gap-1 rounded-2xl" >
                                <button onClick={() => pick(t)} className="flex-1 min-w-0 flex items-center gap-3 h-11 px-2 rounded-2xl text-left transition active:scale-[0.99]" style={{ color: colors.textPrimary }}>
                                    <Search size={15} className="flex-shrink-0" style={{ color: colors.textSecondary }} />
                                    <span className="truncate text-[14px] font-bold">{t}</span>
                                </button>
                                <button onClick={() => setRecent(forgetSearch(t))} aria-label={`Tirar "${t}" das buscas`} className="w-9 h-9 flex-shrink-0 rounded-full flex items-center justify-center" style={{ color: colors.textSecondary }}><X size={15} /></button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {!loaded && (
                <div className="flex flex-col gap-2" aria-hidden>
                    <span className="h-4 w-44 rounded-full animate-pulse" style={{ background: `${colors.border}55` }} />
                    <div className="flex flex-wrap gap-2">{[88, 64, 104, 72, 96, 60].map((w, i) => <span key={i} className="h-9 rounded-full animate-pulse" style={{ width: w, background: `${colors.border}40` }} />)}</div>
                </div>
            )}

            {shown.map((scope) => {
                const list = trends[scope] || []
                const ui = SCOPE_UI[scope]
                const info = trendSection(scope, list[0]?.place ?? null)
                return (
                    <section key={scope} aria-label={info.title}>
                        <Head icon={ui.icon} color={ui.color} title={info.title} subtitle={info.subtitle} />
                        <div className="flex flex-wrap gap-2">
                            {list.slice(0, 8).map((t, i) => (
                                <button
                                    key={t.term}
                                    onClick={() => pick(t.term)}
                                    title={peopleLabel(t.people)}
                                    className="h-9 pl-1.5 pr-3.5 rounded-full flex items-center gap-2 text-[13px] font-black transition active:scale-95"
                                    style={{ background: `${ui.color}14`, color: colors.textPrimary, border: `1.5px solid ${ui.color}33` }}
                                >
                                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-white flex-shrink-0" style={{ background: i < 3 ? RANK_BG[i] : ui.color }}>{i + 1}</span>
                                    <span className="capitalize">{t.term}</span>
                                </button>
                            ))}
                        </div>
                    </section>
                )
            })}

            {nothing && (
                <p className="text-sm text-center py-6" style={{ color: colors.textSecondary }}>
                    Digite para procurar lojas, serviços, produtos e pessoas. As buscas mais feitas vão aparecer aqui.
                </p>
            )}
        </div>
    )
}
