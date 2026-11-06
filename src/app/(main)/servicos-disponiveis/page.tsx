// app/(main)/servicos-disponiveis/page.tsx
//
// Todos os serviços do iUser: os das lojas (serviços do catálogo) e os divulgados por pessoas (perfis), no mesmo cartão em
// linha de /produtos. "Serviços que você pode gostar" da home leva pra cá. (/servicos é a categoria de lojas, por isso o nome.)
// `?tipo=profissionais` mostra só os serviços de pessoas ("Ver todas" de Profissionais no /comprar) e `?tipo=agendar` só os de lojas
// ("Ver todas" de Serviços para agendar). Em cima da lista, uma linha de filtros no desenho do /lojas: categoria (só serviços de loja),
// ordenação e "Abertas" (lojas) / "Online" (profissionais).
'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowDown, ArrowUp, Clock, Eye, Star, Wrench } from 'lucide-react'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import Header from '@/components/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import ListingRowCard from '@/components/ListingRowCard'
import { Spinner } from '@/components/Spinner'
import { useInsideShell } from '@/components/InsideShell'
import ListFilters, { type SortOption } from '@/components/ListFilters'
import { loadServiceCards, type ServiceCard } from '@/lib/serviceCards'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const PAGE_SIZE = 24

// Serviço sem valor (o de pessoa nunca tem; o de loja pode não ter) diz "Valor a combinar" em vez de R$ 0,00
const formatPrice = (price: number | null) => (price != null && price > 0 ? price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Valor a combinar')

const SORTS: SortOption[] = [
    { id: 'vistos', label: 'Mais vistos', short: 'Vistos', icon: Eye },
    { id: 'recentes', label: 'Recentes', short: 'Recentes', icon: Clock },
    { id: 'avaliados', label: 'Melhores avaliados', short: 'Melhores', icon: Star },
    { id: 'menor', label: 'Menor preço', short: 'Menor preço', icon: ArrowDown },
    { id: 'maior', label: 'Maior preço', short: 'Maior preço', icon: ArrowUp },
]

const TIPOS = {
    profissionais: { kind: 'Pessoa' as const, title: 'Atendimento profissional', placeholder: 'Procurar atendimento profissional', empty: 'Nenhum atendimento profissional por enquanto' },
    agendar: { kind: 'Loja' as const, title: 'Serviços para agendar', placeholder: 'Procurar serviços para agendar', empty: 'Nenhum serviço para agendar por enquanto' },
}

export default function ServicosDisponiveisPage() {
    return <Suspense fallback={null}><ServicosDisponiveis /></Suspense>
}

function ServicosDisponiveis() {
    const router = useRouter()
    const tipoParam = useSearchParams().get('tipo')
    const tipo = tipoParam === 'profissionais' || tipoParam === 'agendar' ? TIPOS[tipoParam] : null
    const v3 = useInsideShell()
    const { colors } = useTheme()
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()

    const [services, setServices] = useState<ServiceCard[] | null>(null)
    const [search, setSearch] = useState('')
    const [shown, setShown] = useState(PAGE_SIZE)
    const [category, setCategory] = useState('todas')
    const [sort, setSort] = useState('vistos')
    // "Abertas" (serviço de loja) ou "Online" (atendimento profissional); sem `tipo` (lista geral) não há interruptor
    const [onlyNow, setOnlyNow] = useState(false)

    useEffect(() => { loadServiceCards().then(setServices).catch(() => setServices([])) }, [])

    const counts = useMemo(() => {
        const n: Record<string, number> = {}
        for (const s of services || []) if (s.categorySlug && (!tipo || s.kind === tipo.kind)) n[s.categorySlug] = (n[s.categorySlug] || 0) + 1
        return n
    }, [services, tipo])
    // Categoria é da loja: no atendimento profissional (pessoas) não há; na lista geral só vale para os serviços de loja
    const hasCats = tipo?.kind !== 'Pessoa'

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        let list = (services || []).filter((s) => {
            if (tipo && s.kind !== tipo.kind) return false
            if (hasCats && category !== 'todas' && s.categorySlug !== category) return false
            if (onlyNow && tipo && (tipo.kind === 'Loja' ? s.storeOpen === false : s.ownerOnline === false)) return false
            return !q || !!(s.name?.toLowerCase().includes(q) || s.seller.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q))
        })
        const time = (s: ServiceCard) => new Date(s.createdAt || 0).getTime()
        const price = (s: ServiceCard) => (s.price != null && s.price > 0 ? s.price : Number.POSITIVE_INFINITY)
        const sorters: Record<string, (a: ServiceCard, b: ServiceCard) => number> = {
            vistos: (a, b) => b.views - a.views,
            recentes: (a, b) => time(b) - time(a),
            avaliados: (a, b) => b.rating - a.rating,
            menor: (a, b) => price(a) - price(b),
            maior: (a, b) => (b.price || 0) - (a.price || 0),
        }
        list = [...list].sort(sorters[sort] || sorters.vistos)
        return list
    }, [services, search, tipo, hasCats, category, onlyNow, sort])

    useEffect(() => { setShown(PAGE_SIZE) }, [search, category, onlyNow, sort])
    useEffect(() => { setCategory('todas'); setOnlyNow(false) }, [tipoParam])

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh" style={{ overscrollBehavior: 'none' }}>
                <Header
                    title={tipo?.title || 'Serviços'}
                    showBack
                    onBack={() => (tipo && window.history.length > 1 ? router.back() : router.push('/'))}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                    showSearch
                    searchPlaceholder={tipo?.placeholder || 'Procurar serviços'}
                    searchValue={search}
                    onSearch={setSearch}
                />

                <section className="px-4 md:px-6 mt-3 pb-24">
                    <div className="mb-3">
                        <ListFilters
                            sorts={SORTS} sort={sort} onSort={setSort}
                            counts={hasCats ? counts : undefined} category={category} onCategory={setCategory}
                            toggle={tipo ? { label: tipo.kind === 'Loja' ? 'Abertas' : 'Online', active: onlyNow, onToggle: () => setOnlyNow((v) => !v) } : undefined}
                        />
                    </div>
                    {services === null ? (
                        <div className="flex justify-center py-16"><Spinner size={28} color={colors.accent} /></div>
                    ) : filtered.length === 0 ? (
                        <div className="rounded-3xl p-8 flex flex-col items-center gap-2 text-center" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                            <span className="w-14 h-14 rounded-full flex items-center justify-center text-white" style={{ background: GRADIENT }}><Wrench size={26} /></span>
                            <p className="text-sm font-black" style={{ color: colors.textPrimary }}>{search || category !== 'todas' || onlyNow ? 'Nenhum serviço com esses filtros' : tipo?.empty || 'Nenhum serviço por enquanto'}</p>
                        </div>
                    ) : (
                        <>
                            <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>
                                {filtered.length} {tipo?.kind === 'Pessoa' ? (filtered.length === 1 ? 'atendimento' : 'atendimentos') : filtered.length === 1 ? 'serviço' : 'serviços'}{search ? ` para “${search}”` : ''}
                            </p>
                            <div className={v3 ? 'flex flex-col' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3'}>
                                {filtered.slice(0, shown).map((s) => (
                                    <ListingRowCard
                                        key={s.id}
                                        title={s.name}
                                        description={s.description}
                                        imageUrl={s.imageUrl || s.sellerImage}
                                        priceLabel={formatPrice(s.price)}
                                        priceNote={s.minutes ? `${s.minutes} min` : null}
                                        sellerName={s.seller}
                                        sellerImageUrl={s.sellerImage}
                                        sellerId={s.sellerId}
                                        tag={s.kind}
                                        rating={s.rating}
                                        views={s.views}
                                        onClick={() => router.push(s.href)}
                                    />
                                ))}
                            </div>
                            {shown < filtered.length && (
                                <div className="flex justify-center mt-5">
                                    <button
                                        onClick={() => setShown((n) => n + PAGE_SIZE)}
                                        className="px-6 py-3 rounded-full font-black text-sm text-white transition-transform hover:scale-105 active:scale-95"
                                        style={v3 ? { background: '#f97316' } : { background: GRADIENT, boxShadow: '0 4px 12px #f9731640' }}
                                    >
                                        Mostrar mais
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </section>
            </main>
        </div>
    )
}
