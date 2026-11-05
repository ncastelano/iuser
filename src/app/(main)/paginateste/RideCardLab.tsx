// src/app/(main)/paginateste/RideCardLab.tsx
//
// LABORATÓRIO DO CARD DE CORRIDA DA HOME (página de teste, não faz parte do app): uma proposta de card enxuto, humano e com o VALOR em destaque,
// e de como mostrar quando a corrida está VALORIZADA. Nada aqui lê banco nem grava: os dados são de exemplo. Se for aprovado, vira o card da
// home (o técnico — Tarifa iUser, Minha tarifa, pisos — passa para "Como chegamos nesse valor", recolhido, e continua inteiro na página da corrida).
'use client'

import { useMemo, useState } from 'react'
import { ArrowRight, ChevronDown, Clock, Flame, Package, TrendingUp, Users, Car, Bike } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import RideMiniMap from '@/app/(main)/aceitar-corridas/RideMiniMap'

const ORANGE = '#f97316'
const GREEN = '#16a34a'

type Tier = 'none' | 'good' | 'great'

interface Sample {
    id: string
    who: string
    asked: string
    kind: 'carro' | 'moto'
    people: number
    from: string
    to: string
    pickupMin: number
    tripMin: number
    km: number
    /** pontos de exemplo em Porto Velho: o mini-mapa é o MESMO do app (imagem do Mapbox com a rota) */
    o: [number, number]   // [lat, lng] da partida
    d: [number, number]   // [lat, lng] da chegada
    /** o que o motorista recebe (a oferta do passageiro, se houver, senão o que a sua tarifa dá) */
    price: number
    /** a referência: a Tarifa iUser da mesma corrida */
    reference: number
    /** de quanto o passageiro partiu, quando ele foi aumentando a oferta */
    startedAt?: number
    waitingMin?: number
    mine: number
    floorNote?: string
}

const SAMPLES: Sample[] = [
    { id: 'a', who: 'Ana', asked: 'agora há pouco', kind: 'carro', people: 3, from: 'Rodoviária', to: 'Centro', pickupMin: 4, tripMin: 8, km: 3.3, o: [-8.7712, -63.8955], d: [-8.7619, -63.9039], price: 14.5, reference: 10.25, startedAt: 10, mine: 7, floorNote: 'Mínimo da plataforma: R$ 9,60' },
    { id: 'b', who: 'Bruno', asked: 'há 6 min', kind: 'carro', people: 1, from: 'Shopping Porto Velho', to: 'Av. Carlos Gomes', pickupMin: 20, tripMin: 18, km: 9.3, o: [-8.7555, -63.8929], d: [-8.8052, -63.8689], price: 41.9, reference: 39.07, mine: 30.23, floorNote: 'Mínimo da plataforma: R$ 30,23' },
    { id: 'c', who: 'Carla', asked: 'há 14 min', kind: 'carro', people: 2, from: 'Aeroporto', to: 'Hotel Ecos', pickupMin: 9, tripMin: 22, km: 11.4, o: [-8.7093, -63.9023], d: [-8.7619, -63.9039], price: 36, reference: 29.8, waitingMin: 14, startedAt: 30, mine: 26 },
    { id: 'd', who: 'Davi', asked: 'há 2 min', kind: 'moto', people: 1, from: 'Bairro Nova Esperança', to: 'Terminal', pickupMin: 6, tripMin: 10, km: 4.1, o: [-8.7960, -63.8750], d: [-8.7700, -63.8990], price: 9.8, reference: 9.6, mine: 8 },
]

// ===== Regra PROPOSTA de "valorizada": o quanto o valor da corrida passa da Tarifa iUser da MESMA corrida (hoje já dá para calcular: oferta do passageiro × tarifa) =====
function tierOf(price: number, reference: number): { tier: Tier; pct: number } {
    if (!(reference > 0)) return { tier: 'none', pct: 0 }
    const pct = Math.round(((price - reference) / reference) * 100)
    if (pct >= 20) return { tier: 'great', pct }
    if (pct >= 5) return { tier: 'good', pct }
    return { tier: 'none', pct: Math.max(pct, 0) }
}

const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`
const perHour = (price: number, minutes: number) => Math.round(price / (minutes / 60))

function Money({ value, color, size = 44 }: { value: number; color: string; size?: number }) {
    const [int, cents] = value.toFixed(2).split('.')
    return (
        <span className="inline-flex items-baseline font-black leading-none tabular-nums" style={{ color }}>
            <span style={{ fontSize: size * 0.4, marginRight: 3 }}>R$</span>
            <span style={{ fontSize: size, letterSpacing: '-0.03em' }}>{int}</span>
            <span style={{ fontSize: size * 0.4 }}>,{cents}</span>
        </span>
    )
}

function RideCard({ s, openByDefault = false }: { s: Sample; openByDefault?: boolean }) {
    const { colors } = useTheme()
    const [open, setOpen] = useState(openByDefault)
    const { tier, pct } = useMemo(() => tierOf(s.price, s.reference), [s.price, s.reference])
    const total = s.pickupMin + s.tripMin
    const hot = tier === 'great'
    const accent = tier === 'none' ? colors.textPrimary : hot ? '#ea580c' : GREEN
    const KindIcon = s.kind === 'moto' ? Bike : Car

    return (
        <article className="rounded-3xl overflow-hidden" style={{ background: colors.surface ?? colors.background, border: `1px solid ${hot ? `${ORANGE}66` : colors.border}`, boxShadow: hot ? `0 10px 30px ${ORANGE}26` : '0 1px 3px rgba(0,0,0,0.06)' }}>
            {tier !== 'none' && (
                <div className="flex items-center gap-2 px-4 py-2 text-[12px] font-black" style={{ background: hot ? `linear-gradient(90deg, ${ORANGE}, #ef4444)` : `${GREEN}1a`, color: hot ? '#fff' : GREEN }}>
                    {hot ? <Flame size={15} /> : <TrendingUp size={15} />}
                    <span>{hot ? 'Corrida valorizada' : 'Paga acima do normal'}</span>
                    <span className="ml-auto font-bold opacity-90">{s.startedAt && s.startedAt < s.price ? `subiu de ${brl(s.startedAt)}` : `+${pct}%`}</span>
                </div>
            )}

            <div className="p-4 flex flex-col gap-3">
                {/* quem pediu, em uma linha */}
                <div className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[14px] font-black flex-shrink-0" style={{ background: ORANGE }}>{s.who[0]}</span>
                    <p className="min-w-0 text-[13px] leading-tight">
                        <strong className="font-black">{s.who}</strong> <span style={{ color: colors.textSecondary }}>pediu {s.kind === 'moto' ? 'uma moto' : 'um carro'} · {s.asked}</span>
                    </p>
                </div>

                {/* O VALOR */}
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <Money value={s.price} color={accent} />
                        <p className="text-[13px] font-black mt-1.5" style={{ color: tier === 'none' ? colors.textSecondary : accent }}>
                            dá uns R$ {perHour(s.price, total)} por hora
                        </p>
                    </div>
                    <div className="w-[118px] h-[78px] rounded-2xl overflow-hidden flex-shrink-0" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                        <RideMiniMap thumb originLat={s.o[0]} originLng={s.o[1]} destLat={s.d[0]} destLng={s.d[1]} driverLat={null} driverLng={null} />
                    </div>
                </div>

                {/* o trajeto, como se contaria a um amigo */}
                <p className="text-[14px] leading-snug">
                    <span className="font-black">{s.from}</span>
                    <span style={{ color: colors.textSecondary }}> até </span>
                    <span className="font-black">{s.to}</span>
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-bold" style={{ color: colors.textSecondary }}>
                    <span className="inline-flex items-center gap-1"><Clock size={13} /> você chega em {s.pickupMin} min</span>
                    <span className="inline-flex items-center gap-1"><KindIcon size={13} /> corrida de {s.tripMin} min · {s.km.toFixed(1).replace('.', ',')} km</span>
                    {s.people > 1 && <span className="inline-flex items-center gap-1"><Users size={13} /> {s.people} passageiros</span>}
                    {s.kind === 'moto' && <span className="inline-flex items-center gap-1"><Package size={13} /> leve só 1</span>}
                </div>

                {tier !== 'none' && (
                    <p className="text-[12.5px] leading-snug rounded-2xl px-3 py-2" style={{ background: hot ? `${ORANGE}14` : `${GREEN}12`, color: colors.textPrimary }}>
                        {s.who} {s.startedAt && s.startedAt < s.price ? `foi aumentando a oferta e agora paga` : 'está pagando'} <strong>{brl(s.price - s.reference)} a mais</strong> que a tarifa do iUser{s.waitingMin ? ` — e espera há ${s.waitingMin} min` : ''}.
                    </p>
                )}

                <button className="h-12 rounded-full text-white text-[14px] font-black flex items-center justify-center gap-2 active:scale-[0.98] transition" style={{ background: hot ? `linear-gradient(90deg, ${ORANGE}, #ef4444)` : ORANGE }}>
                    Ver corrida <ArrowRight size={17} />
                </button>

                {/* o técnico, recolhido */}
                <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex items-center justify-center gap-1 text-[12px] font-bold py-0.5" style={{ color: colors.textSecondary }}>
                    Como chegamos nesse valor <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }} />
                </button>
                {open && (
                    <div className="rounded-2xl p-3 text-[12px] flex flex-col gap-1.5" style={{ background: `${colors.border}20` }}>
                        <Row k="Tarifa iUser (com o trajeto até você)" v={brl(s.reference)} />
                        <Row k="Sua tarifa" v={brl(s.mine)} />
                        <Row k={s.startedAt && s.startedAt < s.price ? 'Oferta de ' + s.who + ' (começou em ' + brl(s.startedAt) + ')' : 'Oferta de ' + s.who} v={brl(s.price)} bold />
                        {s.floorNote && <p className="text-[11px] pt-1" style={{ color: colors.textSecondary }}>{s.floorNote} · {total} min de trabalho</p>}
                    </div>
                )}
            </div>
        </article>
    )
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
    return (
        <div className="flex items-baseline justify-between gap-3">
            <span>{k}</span>
            <span className={bold ? 'font-black' : 'font-bold'}>{v}</span>
        </div>
    )
}

export default function RideCardLab() {
    const { colors } = useTheme()
    const ordered = useMemo(() => [...SAMPLES].sort((a, b) => tierOf(b.price, b.reference).pct - tierOf(a.price, a.reference).pct), [])
    return (
        <div className="min-h-screen px-4 py-6" style={{ background: colors.background, color: colors.textPrimary }}>
            <div className="mx-auto max-w-[420px] flex flex-col gap-4">
                <header>
                    <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: ORANGE }}>Laboratório · card de corrida da home</p>
                    <h1 className="text-[20px] font-black leading-tight mt-1">Mais humano, mais enxuto, valor em destaque</h1>
                    <p className="text-[12.5px] mt-1.5" style={{ color: colors.textSecondary }}>
                        O que a pessoa quer saber é: <strong>quanto eu ganho, quão longe, quanto tempo</strong>. O resto (Tarifa iUser, sua tarifa, mínimos) fica em "Como chegamos nesse valor" e inteiro na página da corrida.
                    </p>
                </header>

                <section className="rounded-2xl p-3 text-[12px] leading-snug" style={{ border: `1px dashed ${colors.border}`, color: colors.textSecondary }}>
                    <strong style={{ color: colors.textPrimary }}>Regra proposta de "valorizada"</strong> (calculada hoje com o que já existe, sem tabela nova): quanto o valor da corrida passa da Tarifa iUser da MESMA corrida.
                    <br />• de <strong>+5%</strong> a <strong>+19%</strong>: "Paga acima do normal" (verde)
                    <br />• <strong>+20%</strong> ou mais: "Corrida valorizada" (laranja, com chama; as valorizadas sobem para o começo da lista)
                    <br />Aparece quando o passageiro aumenta a oferta ou a corrida fica esperando. Os cartões abaixo mostram os quatro casos.
                </section>

                {ordered.map((s, i) => <RideCard key={s.id} s={s} openByDefault={i === 1} />)}

                <p className="text-[11px] text-center pb-8" style={{ color: colors.textSecondary }}>Dados de exemplo · nada aqui lê ou grava no banco.</p>
            </div>
        </div>
    )
}
