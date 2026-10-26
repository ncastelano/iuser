// src/versions/v3/screens/ImoveisScreen.tsx
//
// /imoveis na interface 3.0: a BUSCA de imóveis para alugar. Filtros na própria página (mensal ou temporada, tipo, preço máximo, quartos,
// aceita pet, mobiliado, bairro/cidade) e a ordem. O preço sempre mostra o total do mês (aluguel + condomínio + IPTU), que é o que o
// locatário de fato paga. A regra mora em modules/rentals.
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Home, LayoutGrid, PawPrint, Plus, Search, Sofa, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { handleShareLink } from '@/lib/share'
import { Spinner } from '@/components/Spinner'
import RentalCardView from '@/components/rentals/RentalCardView'
import { EMPTY_FILTERS, PROPERTY_TYPES, filterListings, shareText, type PropertyType, type RentalFilters } from '@/modules/rentals/domain'
import { loadRentalListings, type RentalCard } from '@/modules/rentals/load'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const PRICES = [800, 1200, 1800, 2500, 4000]

export default function ImoveisScreen() {
    const { colors } = useTheme()
    const router = useRouter()
    const [items, setItems] = useState<RentalCard[] | null>(null)
    const [f, setF] = useState<RentalFilters>(EMPTY_FILTERS)
    const soft = `${colors.border}40`

    useEffect(() => { let alive = true; loadRentalListings(supabase).then((r) => { if (alive) setItems(r) }).catch(() => { if (alive) setItems([]) }); return () => { alive = false } }, [])

    const shown = useMemo(() => filterListings(items || [], f), [items, f])
    const set = (p: Partial<RentalFilters>) => setF((cur) => ({ ...cur, ...p }))
    const toggleType = (t: PropertyType) => set({ types: f.types.includes(t) ? f.types.filter((x) => x !== t) : [...f.types, t] })
    const dirty = JSON.stringify(f) !== JSON.stringify(EMPTY_FILTERS)

    const chip = (active: boolean) => (active ? { background: GRADIENT, color: '#fff' } : { background: soft, color: colors.textPrimary })
    const pill = 'flex-shrink-0 h-10 px-3.5 rounded-full text-[13px] font-black flex items-center gap-1.5 whitespace-nowrap transition active:scale-95'

    return (
        <div className="pb-28">
            <div className="flex items-center gap-2">
                <button onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))} aria-label="Voltar" className="flex-shrink-0 rounded-full flex items-center justify-center transition active:scale-95" style={{ width: 46, height: 46, background: soft, color: colors.textPrimary }}>
                    <ArrowLeft size={20} />
                </button>
                <div className="flex-1 min-w-0 flex items-center gap-2 px-4 rounded-full" style={{ height: 46, background: soft }}>
                    <Search size={17} className="flex-shrink-0" style={{ color: colors.textSecondary }} />
                    <input value={f.where} onChange={(e) => set({ where: e.target.value })} placeholder="Bairro ou cidade" className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none" style={{ color: colors.textPrimary }} />
                    {f.where && <button onClick={() => set({ where: '' })} aria-label="Limpar" style={{ color: colors.textSecondary }}><X size={16} /></button>}
                </div>
            </div>

            {/* Filtros numa linha só (rola pro lado), como no /comprar: finalidade e condições primeiro, depois os tipos, e preço/quartos/ordem no fim */}
            <div className="mt-3 flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4" style={{ overflowAnchor: 'none' }}>
                {([['mensal', 'Mensal'], ['temporada', 'Temporada']] as const).map(([k, label]) => (
                    <button key={k} onClick={() => set({ kind: f.kind === k ? 'todos' : k })} className={pill} style={chip(f.kind === k)}>{label}</button>
                ))}
                <button onClick={() => set({ pets: !f.pets })} className={pill} style={chip(f.pets)}><PawPrint size={14} /> Aceita pet</button>
                <button onClick={() => set({ furnished: !f.furnished })} className={pill} style={chip(f.furnished)}><Sofa size={14} /> Mobiliado</button>
                <span aria-hidden className="flex-shrink-0 w-px h-6" style={{ background: colors.border }} />
                <button onClick={() => set({ types: [] })} className={`${pill} pl-3`} style={chip(f.types.length === 0)}><LayoutGrid size={14} /> Tudo</button>
                {PROPERTY_TYPES.map((t) => <button key={t.id} onClick={() => toggleType(t.id)} className={pill} style={chip(f.types.includes(t.id))}>{t.label}</button>)}
                <span aria-hidden className="flex-shrink-0 w-px h-6" style={{ background: colors.border }} />
                <select value={f.maxPrice ?? ''} onChange={(e) => set({ maxPrice: e.target.value ? Number(e.target.value) : null })} className="flex-shrink-0 h-10 px-3 rounded-full text-[13px] font-black focus:outline-none" style={f.maxPrice != null ? { background: GRADIENT, color: '#fff' } : { background: soft, color: colors.textPrimary }} aria-label="Preço máximo">
                    <option value="">Qualquer preço</option>
                    {PRICES.map((p) => <option key={p} value={p}>Até R$ {p.toLocaleString('pt-BR')}</option>)}
                </select>
                <select value={f.minBedrooms ?? ''} onChange={(e) => set({ minBedrooms: e.target.value ? Number(e.target.value) : null })} className="flex-shrink-0 h-10 px-3 rounded-full text-[13px] font-black focus:outline-none" style={f.minBedrooms != null ? { background: GRADIENT, color: '#fff' } : { background: soft, color: colors.textPrimary }} aria-label="Quartos">
                    <option value="">Quartos</option>
                    {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}+ quartos</option>)}
                </select>
                <select value={f.sort} onChange={(e) => set({ sort: e.target.value as RentalFilters['sort'] })} className="flex-shrink-0 h-10 px-3 rounded-full text-[13px] font-black focus:outline-none" style={{ background: soft, color: colors.textPrimary }} aria-label="Ordem">
                    <option value="recentes">Mais recentes</option>
                    <option value="menor_preco">Menor preço</option>
                    <option value="maior_preco">Maior preço</option>
                </select>
                {dirty && <button onClick={() => setF(EMPTY_FILTERS)} className="flex-shrink-0 h-10 px-3 text-[13px] font-black" style={{ color: colors.accent }}>Limpar</button>}
            </div>

            <div className="mt-4 flex items-center justify-between">
                <p className="text-xs font-bold" style={{ color: colors.textSecondary }}>{items === null ? 'Buscando…' : `${shown.length} ${shown.length === 1 ? 'imóvel' : 'imóveis'}`}</p>
                <button onClick={() => router.push('/meus-imoveis')} className="text-xs font-black" style={{ color: colors.accent }}>Meus imóveis</button>
            </div>

            {items === null ? (
                <div className="flex justify-center py-16"><Spinner size={26} color={colors.accent} /></div>
            ) : shown.length === 0 ? (
                <div className="mt-4 rounded-3xl p-8 text-center flex flex-col items-center gap-2" style={{ background: soft }}>
                    <Home size={34} style={{ color: colors.textSecondary }} />
                    <p className="text-sm font-black" style={{ color: colors.textPrimary }}>{items.length === 0 ? 'Nenhum imóvel anunciado ainda' : 'Nenhum imóvel com esses filtros'}</p>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>{items.length === 0 ? 'Seja o primeiro: anunciar leva poucos minutos.' : 'Tente outro bairro, preço ou tire algum filtro.'}</p>
                    {items.length > 0 && dirty && <button onClick={() => setF(EMPTY_FILTERS)} className="mt-1 text-xs font-black" style={{ color: colors.accent }}>Limpar filtros</button>}
                </div>
            ) : (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {shown.map((l) => (
                        <RentalCardView
                            key={l.id}
                            l={l}
                            onOpen={() => router.push(`/imoveis/${l.slug}`)}
                            onShare={() => void handleShareLink({ title: l.title, text: shareText(l), url: `${window.location.origin}/imoveis/${l.slug}`, imageUrl: l.photos[0] || null })}
                        />
                    ))}
                </div>
            )}

            <button onClick={() => router.push('/anunciar-imovel')} className="fixed right-4 z-30 h-14 px-5 rounded-full flex items-center gap-2 text-white font-black text-sm transition active:scale-95" style={{ background: GRADIENT, boxShadow: '0 8px 24px #f9731655', bottom: 'calc(var(--staging-banner-h, 0px) + 20px)' }}>
                <Plus size={20} /> Anunciar imóvel
            </button>
        </div>
    )
}
