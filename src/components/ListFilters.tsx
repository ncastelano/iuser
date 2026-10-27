// src/components/ListFilters.tsx
//
// Filtros de uma linha só, no mesmo desenho do /lojas (3.0): categoria, ordenação e um interruptor ("Abertas", "Online"...).
// Os menus abrem logo abaixo da linha. Usado nas listas de produtos e de serviços (2.0 e 3.0); quem usa guarda o estado e aplica.
'use client'

import { useState } from 'react'
import { Check, ChevronDown, LayoutGrid, Scissors, type LucideIcon } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { categorias } from '@/lib/categorias'

export interface SortOption { id: string; label: string; short: string; icon: LucideIcon }

const catList = categorias.filter((c) => c.slug !== 'comunidades' && c.slug !== 'social')
const catName = (slug: string) => (slug === 'transporte' ? 'Frete' : catList.find((c) => c.slug === slug)?.nome || slug)

export default function ListFilters({ sorts, sort, onSort, counts, category = 'todas', onCategory, toggle }: {
    sorts: SortOption[]
    sort: string
    onSort: (id: string) => void
    /** quantos itens há em cada categoria (as que têm vêm primeiro); sem isto, a linha não tem o seletor de categoria */
    counts?: Record<string, number>
    category?: string
    onCategory?: (slug: string) => void
    toggle?: { label: string; active: boolean; onToggle: () => void }
}) {
    const { colors } = useTheme()
    const [menu, setMenu] = useState<'cat' | 'sort' | null>(null)
    const pill = { background: `${colors.border}40`, color: colors.textPrimary }

    const hasCats = !!counts && !!onCategory
    const orderedCats = hasCats ? [...catList].sort((a, b) => (counts![b.slug] || 0) - (counts![a.slug] || 0)) : []
    const cur = category === 'todas' ? null : catList.find((c) => c.slug === category) || null
    const CurIcon = cur ? (cur.slug === 'servicos' ? Scissors : cur.icone) : LayoutGrid
    const curSort = sorts.find((x) => x.id === sort) || sorts[0]
    const SortIcon = curSort.icon

    return (
        <div className="relative">
            <div className="flex items-center gap-2">
                {hasCats && (
                    <button
                        onClick={() => setMenu(menu === 'cat' ? null : 'cat')}
                        aria-expanded={menu === 'cat'}
                        className="flex-1 min-w-0 h-10 pl-3 pr-2.5 rounded-full text-xs font-black flex items-center gap-1.5 transition active:scale-[0.98]"
                        style={cur ? { background: `${cur.color}1f`, color: colors.textPrimary } : pill}
                    >
                        <CurIcon size={15} className="flex-shrink-0" style={{ color: cur ? cur.color : colors.textSecondary }} />
                        <span className="truncate">{cur ? catName(cur.slug) : 'Todas'}</span>
                        <ChevronDown size={14} className="flex-shrink-0 ml-auto" style={{ color: colors.textSecondary }} />
                    </button>
                )}
                <button
                    onClick={() => setMenu(menu === 'sort' ? null : 'sort')}
                    aria-expanded={menu === 'sort'}
                    className={`${hasCats ? 'flex-shrink-0' : 'flex-1 min-w-0'} h-10 pl-3 pr-2.5 rounded-full text-xs font-black flex items-center gap-1.5 transition active:scale-[0.98]`}
                    style={pill}
                >
                    <SortIcon size={14} className="flex-shrink-0" />
                    <span className="truncate">{curSort.short}</span>
                    <ChevronDown size={14} className="flex-shrink-0 ml-auto" style={{ color: colors.textSecondary }} />
                </button>
                {toggle && (
                    <button
                        onClick={toggle.onToggle}
                        aria-pressed={toggle.active}
                        className="flex-shrink-0 h-10 px-3.5 rounded-full text-xs font-black flex items-center gap-1.5 transition active:scale-[0.98]"
                        style={toggle.active ? { background: '#16a34a', color: '#fff' } : { background: '#16a34a1a', color: '#16a34a' }}
                    >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: toggle.active ? '#fff' : '#16a34a' }} />
                        {toggle.label}
                    </button>
                )}
            </div>

            {menu && (
                <>
                    <button aria-label="Fechar" onClick={() => setMenu(null)} className="fixed inset-0 z-30 cursor-default" />
                    <div className="absolute left-0 right-0 top-12 z-40 rounded-3xl p-2" style={{ background: colors.surface, boxShadow: '0 14px 40px rgba(0,0,0,0.18)', border: `1px solid ${colors.border}` }}>
                        {menu === 'cat' ? (
                            <div className="grid grid-cols-2 gap-1 max-h-[52dvh] overflow-y-auto">
                                {[{ slug: 'todas', nome: 'Todas', color: colors.textSecondary, icone: LayoutGrid } as any, ...orderedCats].map((c) => {
                                    const Icon = c.slug === 'servicos' ? Scissors : c.icone
                                    const selected = category === c.slug
                                    const has = c.slug === 'todas' || (counts![c.slug] || 0) > 0
                                    return (
                                        <button
                                            key={c.slug}
                                            onClick={() => { onCategory!(c.slug); setMenu(null) }}
                                            className="flex items-center gap-2 min-h-11 py-1 px-2.5 rounded-2xl text-left text-xs font-black transition active:scale-[0.98]"
                                            style={{ background: selected ? `${c.color}22` : 'transparent', color: colors.textPrimary, opacity: has || selected ? 1 : 0.5 }}
                                        >
                                            <Icon size={16} style={{ color: c.color }} className="flex-shrink-0" />
                                            <span className="flex-1 leading-tight">{c.slug === 'todas' ? 'Todas' : catName(c.slug)}</span>
                                            {selected && <Check size={14} strokeWidth={3} style={{ color: c.color }} className="flex-shrink-0" />}
                                        </button>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                {sorts.map((x) => {
                                    const Icon = x.icon
                                    const selected = sort === x.id
                                    return (
                                        <button
                                            key={x.id}
                                            onClick={() => { onSort(x.id); setMenu(null) }}
                                            className="flex items-center gap-2.5 h-11 px-3 rounded-2xl text-left text-sm font-black transition active:scale-[0.98]"
                                            style={{ background: selected ? `${colors.border}50` : 'transparent', color: colors.textPrimary }}
                                        >
                                            <Icon size={16} className="flex-shrink-0" />
                                            <span className="flex-1">{x.label}</span>
                                            {selected && <Check size={15} strokeWidth={3} />}
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
