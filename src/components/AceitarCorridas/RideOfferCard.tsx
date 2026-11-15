// components/AceitarCorridas/RideOfferCard.tsx
//
// Card de uma corrida — usado na lista de /aceitar-corridas e na prévia em
// /aceitar-corridas/mapa?ride=<id>. Mesmo conteúdo (tipo de veículo, o que a
// corrida envolve, quem pediu, trajeto, Tarifa iUser / Minha tarifa e o
// lápis pra digitar outro valor), só que dentro do card embaixo do mapa.
'use client'

import { useContext, useEffect, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Package, PawPrint, Star, CalendarClock, Pencil, X, Users, Car, Baby, ShoppingBag, AlertTriangle, Accessibility, Eye, Banknote, CreditCard, QrCode, MapPin, Building2, Truck, type LucideIcon } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useInsideShell } from '@/components/InsideShell'
import { Spinner } from '@/components/Spinner'
import { placeLabel } from '@/lib/serviceBoard'
import { humanizeRideSpecs, type HumanSpecKind, type RideSpecFields } from '@/lib/rideSpecs'
import { VEHICLE_TYPE_LABELS, type VehicleType } from '@/lib/rideVehicle'
import { computeHourlyEarnings } from '@/lib/driverPricing'
import { effectiveTimeRate, timeFare, fareParts, fareDriver, fareDriverText, belowMinimum, belowMinimumText, belowPlatformFloor, platformFloor, platformFloorText, hourlyFloor, perHour as perHourOfMinutes, quickValues, round2, suggestedFare, validateAmount, parseMoney, otherValueRange, otherValueProblem, perHourText, centsDigits, centsToValue, centsLabel, packOffer, MAX_OFFER_VALUES } from '@/modules/negotiation/domain'
import PlanAvatarRing from '@/components/PlanAvatarRing'
import { useDefaultMinHourly } from '@/hooks/useDefaultMinHourly'
import { RideValuePickContext } from './rideValuePick'

const TIME_GRADIENT = 'linear-gradient(135deg, #8b5cf6, #6d28d9)'
const GRADIENT_V2 = 'linear-gradient(135deg, #f97316, #dc2626)'
export const TO_PICKUP_COLOR = '#3b82f6'
export const TRIP_COLOR = '#ef4444'

// Ícone e cor de cada linha do resumo ("Levar um objeto", "Paga no Pix"...).
const SPEC_STYLE: Record<HumanSpecKind | 'vehicle' | 'store', { icon: LucideIcon; color: string }> = {
    vehicle: { icon: Car, color: '#f97316' },
    store: { icon: Truck, color: '#16a34a' },
    people: { icon: Users, color: '#3b82f6' },
    child: { icon: Baby, color: '#3b82f6' },
    shopping: { icon: ShoppingBag, color: '#8b5cf6' },
    cargo: { icon: Package, color: '#8b5cf6' },
    pet: { icon: PawPrint, color: '#8b5cf6' },
    fragile: { icon: AlertTriangle, color: '#eab308' },
    delivery: { icon: Truck, color: '#8b5cf6' },
    accessibility: { icon: Accessibility, color: '#ec4899' },
    guide: { icon: Eye, color: '#ec4899' },
    pix: { icon: QrCode, color: '#22c55e' },
    cash: { icon: Banknote, color: '#22c55e' },
    card: { icon: CreditCard, color: '#22c55e' },
    reference: { icon: MapPin, color: '#64748b' },
    condo: { icon: Building2, color: '#64748b' },
}

export type OfferRide = RideSpecFields & {
    id: string
    vehicle_type: VehicleType
    origin_address: string
    destination_address: string
    stop1_address: string | null
    stop2_address: string | null
    distance_km: number | null
    duration_min: number | null
    scheduled_for: string | null
    created_at: string
    offered_price: number | null
    order_id: string | null
    /** o que o passageiro se propôs a pagar (opcional); vem de ride_offers */
    passenger_offer?: number | null
}

export interface OfferRequester {
    id?: string | null
    name: string | null
    slug: string | null
    avatarUrl: string | undefined
    rating: { avg: number; count: number }
}

interface RideOfferCardProps {
    ride: OfferRide
    requester: OfferRequester
    storeName: string | null
    // Valores: sem onApply (ou com footer) a seção de tarifas não aparece.
    platformPrice?: number
    customPrice?: number | null
    // O que a tarifa PRÓPRIA do motorista cobra pelo deslocamento até a partida (km × o valor por km dele), já calculado por quem chama; soma em "Minha tarifa". 0/undefined = sem deslocamento (sem posição, ou entrega de loja)
    customPickup?: number
    // "Minha tarifa por TEMPO" (o 3º valor): o valor por minuto da tarifa própria do motorista e os extras da corrida (tipo e condições); sem valor por minuto a caixa fica "não definida"
    timeRate?: number | null
    timeExtras?: number
    // Os valores de cada trecho (ir buscar, a corrida, total) vêm da tarifa PRÓPRIA do motorista em vez da Tarifa iUser (o motorista usa "Minha tarifa")
    valueFromOwn?: boolean
    applying?: boolean
    /** `alts` = os valores a mais (até 2) que o motorista marcou; o passageiro escolhe um deles ou o principal */
    onApply?: (price: number, alts?: number[]) => void
    // Entrega de loja: propor a Minha tarifa (o cliente decide). O valor é recalculado no servidor.
    onCounter?: () => void
    toPickup: { km: number | null; min: number | null; hasGps: boolean }
    trip: { km: number | null; min: number | null }
    // Mini mapa (lista) entra entre os chips e o trajeto.
    miniMap?: ReactNode
    // Substitui as tarifas (ex: "Aguardando decisão" nas candidaturas).
    footer?: ReactNode
    // Valor já definido (proposta enviada / valor combinado): mesmo quadro das tarifas, com o ganho por hora.
    valueBox?: { label: string; price: number }
    onBack?: () => void
    onSkip?: () => void
    // Deslocamento do motorista até a partida, somado à Tarifa iUser (platformPrice já vem com ele)
    // `from`: 'gps' = posição do aparelho; 'saved' = local salvo / última posição ao vivo (o GPS não está liberado)
    pickup?: { state: 'ready'; km: number; amount: number; from?: 'gps' | 'saved' } | { state: 'waiting' | 'missing' }
    // Como o valor da corrida (partida → chegada) sai da tarifa; aparece enquanto o deslocamento ainda não entrou na conta
    tripFareNote?: string
    // Prévia (home): só o trecho da corrida, sem "até buscar"/total/horário
    compact?: boolean
    // Ganho mínimo por hora do motorista (privado dele): avisa quando um valor fica abaixo e, no modo "block", não deixa aceitar
    minHourly?: number | null
    protection?: 'warn' | 'block'
    // Tocar em "Minha tarifa" abre a tarifa personalizada do motorista (onde ele muda os valores); mandar a proposta por ela é pelo "outro" ou pelo botão da sugestão
    /** abre a Tarifa PERSONALIZADA do painel do motorista, já na parte pedida (km ou tempo) */
    onEditTariff?: (section?: 'km' | 'tempo') => void
    // Valor mínimo da plataforma por minuto de trabalho (Admin → Tarifas): nenhum valor sai abaixo de minutos × isto (0/undefined = sem regra)
    minPerMinute?: number
    // Só LEITURA (a prévia da home): mostra os mesmos valores, mas não manda proposta daqui; quem decide é a página da corrida (use `after` para o botão que leva até lá)
    viewOnly?: boolean
    // Conteúdo depois dos valores (ex.: o botão "Ver corrida" da home)
    after?: ReactNode
}

function relativeTime(iso: string): string {
    const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (minutes < 1) return 'agora'
    if (minutes < 60) return `há ${minutes} min`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `há ${hours}h`
    return `há ${Math.floor(hours / 24)}d`
}

function formatScheduledFor(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`
const kmText = (v: number) => `${v.toFixed(1).replace('.', ',')} km`

// Card compacto e em linguagem simples: quem pediu, de onde pra onde, quanto
// falta pra cada trecho e quanto cobrar — sem rótulos em caixa-alta.
export function RideOfferCard({ ride, requester, storeName, platformPrice = 0, customPrice: customTripPrice = null, customPickup = 0, timeRate = null, timeExtras = 0, valueFromOwn = false, toPickup, trip, applying = false, onApply, onCounter, miniMap, footer, valueBox, onBack, onSkip, minHourly = null, protection = 'warn', onEditTariff, minPerMinute = 0, compact = false, pickup, tripFareNote, viewOnly = false, after }: RideOfferCardProps) {
    const { colors } = useTheme()
    // 3.0: laranja sólido, cartões macios sem moldura/sombra e campos em cápsula (só apresentação; as regras são as mesmas)
    const v3 = useInsideShell()
    const GRADIENT = v3 ? '#f97316' : GRADIENT_V2
    const soft = `${colors.border}30`
    const bd = v3 ? 'none' : `1px solid ${colors.border}`
    const sh = v3 ? 'none' : colors.shadow
    const surf = v3 ? soft : colors.surface
    const [editing, setEditing] = useState(false)
    const [value, setValue] = useState('')

    // Ganho por hora (informativo): valor ÷ tempo total (ir buscar + corrida). Sem os minutos do mapa, cai para a conta por km (40 km/h).
    const minutesTotal = toPickup.min != null && trip.min != null ? (toPickup.min as number) + (trip.min as number) : null
    const perHour = (price: number) => {
        if (minutesTotal) { const v = perHourOfMinutes(price, minutesTotal); return v != null ? Math.round(v) : null }
        if (toPickup.km == null || trip.km == null) return null
        const h = computeHourlyEarnings(price, trip.km, toPickup.km)
        return h ? Math.round(h.perHour) : null
    }
    // Ganho mínimo do motorista: piso por tempo, sugestão e alertas (só dele; nada disso vai para o passageiro)
    const floor = hourlyFloor(minutesTotal, minHourly)
    // Piso da plataforma: minutos × mínimo por minuto. Vale para a Tarifa iUser, para a tarifa do motorista e para qualquer proposta; frete de loja é fixo
    const platFloor = ride.order_id || ride.offered_price != null ? 0 : platformFloor(minutesTotal, minPerMinute)
    const raise = (v: number) => (platFloor > 0 ? Math.max(v, platFloor) : v)
    platformPrice = raise(platformPrice)
    // Minha tarifa = a corrida pela tarifa dele + o deslocamento até a partida pelo valor por km dele (igual à Tarifa iUser, que também soma o deslocamento)
    const customPrice = customTripPrice != null ? round2(customTripPrice + (customPickup > 0 ? customPickup : 0)) : null
    const myFare = customPrice != null ? raise(suggestedFare(customPrice, floor)) : null
    // O piso do ganho mínimo SUBIU a tarifa só quando ele é maior que a tarifa por distância (comparando já arredondado, senão uma diferença de centavos acusa "no seu mínimo" sem o piso ter feito nada)
    const floorRaised = customPrice != null && ((floor != null && floor > round2(customPrice)) || (platFloor > 0 && platFloor > round2(customPrice)))
    const myFareDriver = customPrice != null ? fareDriver(customPrice, floor, platFloor) : null
    const myFareWhy = customPrice != null && myFareDriver && myFareDriver !== 'km' ? fareDriverText(myFareDriver, customPrice, minHourly, minPerMinute) : ''
    // O 3º valor: por tempo (minutos de trabalho × valor por minuto dele + extras), com os mesmos pisos (ganho mínimo por hora e mínimo da plataforma)
    // Sem valor por minuto próprio, vale o ganho mínimo por hora PADRÃO do iUser (R$ 40/h = R$ 0,67 por minuto): o "Por tempo" sempre tem número
    const defaultHourly = useDefaultMinHourly()
    const ownTimeRate = timeRate != null && timeRate > 0 ? timeRate : null
    // o valor por minuto nunca fica abaixo do piso (R$ 40/h ÷ 60 = R$ 0,67); sem valor próprio vale o próprio piso (o padrão do iUser)
    const rateUsed = effectiveTimeRate(ownTimeRate, defaultHourly)
    const timeIsDefault = ownTimeRate == null && rateUsed != null   // sem valor próprio: é o padrão do iUser
    const timeBase = ride.order_id || ride.offered_price != null ? null : timeFare(minutesTotal, rateUsed, timeExtras)
    const myTime = timeBase != null ? raise(suggestedFare(timeBase, floor)) : null
    const timeFloorRaised = timeBase != null && myTime != null && myTime > round2(timeBase)
    const iuserSuggestion = customPrice == null && floor != null && floor > platformPrice ? raise(floor) : null   // sugestão calculada, nunca salva como preferência
    const below = (price: number) => belowMinimum(perHour(price), minHourly)
    const blocked = (price: number) => belowPlatformFloor(price, platFloor) || (protection === 'block' && below(price))
    const [counterOpen, setCounterOpen] = useState(false)

    // ABERTO DENTRO DO CARD ENXUTO (RideSummaryCard): primeiro a LISTA DE VALORES para escolher (o escolhido vira o valor grande e o do deslizar);
    // o resto (o que a corrida leva, mapa, trechos, como cada valor foi feito) fica recolhido em "Ver detalhes da corrida".
    const pick = useContext(RideValuePickContext)
    const embedded = !!pick
    const [marked, setMarked] = useState<string[] | null>(null)   // null = só o valor que o card enxuto mostrava
    const [limitHint, setLimitHint] = useState(false)
    const [showMore, setShowMore] = useState(false)
    type Opt = { key: string; label: string; value: number; tag?: string }
    const options: Opt[] = (() => {
        if (!embedded || ride.offered_price != null || footer || valueBox) return []
        const raw: Opt[] = []
        if (ride.passenger_offer != null) raw.push({ key: 'offer', label: 'Oferta do passageiro', value: round2(Number(ride.passenger_offer)) })
        raw.push({ key: 'iuser', label: pickup && pickup.state !== 'ready' ? 'Tarifa iUser · a partir de' : 'Tarifa iUser', value: round2(platformPrice) })
        if (myFare != null) raw.push({ key: 'km', label: 'Minha tarifa por km', value: round2(myFare), tag: myFareDriver === 'platform' ? 'mínimo da plataforma' : myFareDriver === 'hourly' ? 'seu mínimo por hora' : undefined })
        else if (iuserSuggestion != null) raw.push({ key: 'sug', label: 'Sugestão do iUser', value: round2(iuserSuggestion), tag: 'seu mínimo por hora' })
        if (myTime != null) raw.push({ key: 'tempo', label: timeIsDefault ? 'Por tempo · padrão iUser' : 'Minha tarifa por tempo', value: round2(myTime), tag: timeFloorRaised ? 'mínimo' : undefined })
        // valores IGUAIS viram uma linha só (ex.: "Tarifa iUser = Minha tarifa por km")
        const out: Opt[] = []
        for (const o of raw) {
            const same = out.find((x) => Math.abs(x.value - o.value) < 0.005)
            if (same) { same.label = `${same.label} = ${o.label}`; same.tag = same.tag ?? o.tag } else out.push({ ...o })
        }
        return out
    })()
    const initialKey = options.find((o) => pick && Math.abs(o.value - pick.initial) < 0.005)?.key ?? options[0]?.key ?? null
    // ATÉ 3 VALORES: o motorista marca os que quiser mandar (o passageiro vê um cartão só, com as opções, e escolhe um)
    const keys = marked ?? (initialKey ? [initialKey] : [])
    const outroOpen = keys.includes('outro')
    const toggle = (k: string) => {
        setLimitHint(false)
        if (keys.includes(k)) { if (keys.length > 1) setMarked(keys.filter((x) => x !== k)); return }
        if (keys.length >= MAX_OFFER_VALUES) { setLimitHint(true); return }
        setMarked([...keys, k])
    }
    // "Outro valor": só SOBE — do menor valor entre as opções até o triplo dele; digitado como na maquininha (os dígitos entram pela direita)
    const [outro, setOutro] = useState('')
    const range = otherValueRange(options.map((o) => o.value))
    const typed = centsToValue(outro)
    const outroProblem = otherValueProblem(typed, range)
    const chosen = keys.map((k) => (k === 'outro' ? typed : options.find((o) => o.key === k)?.value ?? null)).filter((v): v is number => v != null)
    const packed = packOffer(chosen)
    const curValue = packed?.price ?? null
    const curBlocked: string | null = outroOpen && outroProblem ? outroProblem
        : !packed ? 'Escolha um valor'
        : packed.problem ? packed.problem
        : belowPlatformFloor(packed.price, platFloor) ? platformFloorText(platFloor, minPerMinute)
        : protection === 'block' && below(packed.price) && minHourly != null && perHour(packed.price) != null ? belowMinimumText(perHour(packed.price) as number, minHourly, 'proposta') : null
    const sendNow = () => { if (packed && !curBlocked) onApply?.(packed.price, packed.alts) }
    const setPick = pick?.set
    const pickLive = embedded && !viewOnly && options.length > 0
    const pricesKey = packed ? [packed.price, ...packed.alts].join(',') : ''
    useEffect(() => { if (pickLive && setPick) setPick(pricesKey ? pricesKey.split(',').map(Number) : null, curBlocked, outroOpen) }, [pickLive, setPick, pricesKey, curBlocked, outroOpen])

    const haveTotal = toPickup.km != null && toPickup.min != null && trip.km != null && trip.min != null
    const totalKm = haveTotal ? (toPickup.km as number) + (trip.km as number) : null
    const totalMin = haveTotal ? (toPickup.min as number) + (trip.min as number) : null
    const arrivalTime = totalMin != null
        ? new Date(Date.now() + totalMin * 60000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : null

    const name = requester.name || (requester.slug ? `@${requester.slug}` : 'Passageiro')
    const when = ride.scheduled_for ? `agendada pra ${formatScheduledFor(ride.scheduled_for)}` : relativeTime(ride.created_at) === 'agora' ? 'pediu agora' : `pediu ${relativeTime(ride.created_at)}`
    const vehicleLabel = ride.vehicle_type === 'qualquer' ? 'Qualquer veículo' : VEHICLE_TYPE_LABELS[ride.vehicle_type]
    const specs = humanizeRideSpecs(ride)

    // Valor de cada trecho (só corrida de passageiro com valores à vista): a tarifa que vale para o motorista repartida em ir buscar + a corrida = total
    const showParts = ride.offered_price == null && !ride.order_id && !footer && !valueBox && platformPrice > 0
    const ownParts = myFare != null ? fareParts(myFare, customPickup > 0 ? customPickup : null) : null
    const parts = !showParts ? null : valueFromOwn && ownParts ? ownParts : fareParts(platformPrice, pickup?.state === 'ready' ? pickup.amount : null)
    const partsLabel = valueFromOwn && ownParts ? 'Minha tarifa' : 'Tarifa iUser'

    const stat = (color: string, label: string, km: number | null, min: number | null, pending: string, value: number | null = null) => (
        <div className="flex-1 min-w-0 rounded-xl px-2.5 py-1.5" style={{ background: `${colors.border}25`, border: bd }}>
            <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: colors.textSecondary }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                {label}
            </span>
            <span className="block text-[11px] font-black leading-tight mt-0.5" style={{ color: colors.textPrimary }}>
                {km != null ? `${kmText(km)}${min != null ? ` · ${Math.round(min)} min` : ''}` : pending}
            </span>
            {value != null && <span className="block text-[13px] font-black leading-tight mt-0.5" style={{ color }}>{brl(value)}</span>}
        </div>
    )

    // Como cada valor foi feito (fica no fim; aberto dentro do card enxuto, só em "Ver detalhes da corrida")
    const notes = (
        <>
                    {/* Como cada valor foi feito (as caixas ficam estreitas com três lado a lado) */}
                    <div className="flex flex-col gap-0.5">
                        {pickup?.state === 'ready' && (
                            <p className="text-[10px] leading-snug" style={{ color: '#16a34a' }}>
                                Ir buscar ({kmText(pickup.km)}{pickup.from === 'saved' ? ', pela sua última posição salva' : ''}): {brl(pickup.amount)} pela Tarifa iUser{customPickup > 0 ? ` · ${brl(customPickup)} pelo seu valor por km` : ''}
                            </p>
                        )}
                        {pickup && pickup.state !== 'ready' && (
                            <p className="text-[10px] leading-snug font-semibold" style={{ color: '#d97706' }}>
                                {pickup.state === 'waiting' ? 'Localizando... falta somar a distância até a partida' : 'Sem o seu local não dá para somar a distância até a partida: defina o local ou libere o GPS'}
                            </p>
                        )}
                        {pickup && pickup.state !== 'ready' && tripFareNote && (
                            <p className="text-[10px] leading-snug" style={{ color: colors.textSecondary }}>{tripFareNote}</p>
                        )}
                        {myTime != null && minutesTotal != null && rateUsed != null && (
                            <p className="text-[10px] leading-snug" style={{ color: colors.textSecondary }}>
                                Por tempo: {Math.round(minutesTotal)} min × {brl(rateUsed)} por minuto ({timeIsDefault ? `padrão do iUser: R$ ${defaultHourly.toLocaleString('pt-BR')} por hora — defina o seu em Tarifa` : 'sua tarifa por tempo'}){timeExtras > 0 ? ` + ${brl(timeExtras)} de extras` : ''}{timeFloorRaised ? ' · subiu até o mínimo' : ''}
                            </p>
                        )}
                        {rateUsed != null && minutesTotal == null && (
                            <p className="text-[10px] leading-snug" style={{ color: colors.textSecondary }}>Por tempo: ainda falta o tempo até a partida (libere o GPS ou defina o seu local).</p>
                        )}
                    </div>
                    {myFareWhy && (
                        <p className="text-[10px] leading-snug font-semibold" style={{ color: '#b45309' }}>{myFareWhy}</p>
                    )}
                    {platFloor > 0 && (
                        <p className="text-[10px] leading-snug" style={{ color: colors.textSecondary }}>
                            Mínimo da plataforma nesta corrida: <strong style={{ color: colors.textPrimary }}>{brl(platFloor)}</strong> · {perHourText(minPerMinute)} de trabalho ({minutesTotal != null ? `${Math.round(minutesTotal)} min` : ''})
                        </p>
                    )}

        </>
    )

    return (
        <div className="flex flex-col gap-2">
            {/* Quem pediu e quando (no card aberto dentro do enxuto, ele já disse) */}
            {!embedded && <div className="flex items-center gap-2">
                <PlanAvatarRing userId={requester.id}>
                {requester.avatarUrl ? (
                    <img src={requester.avatarUrl} className="w-8 h-8 rounded-full object-cover flex-shrink-0" alt="" />
                ) : (
                    <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black" style={{ background: GRADIENT, color: '#fff' }}>
                        {name.charAt(0).toUpperCase()}
                    </span>
                )}
                </PlanAvatarRing>
                <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-black truncate leading-tight" style={{ color: colors.textPrimary }}>{name}</p>
                    <p className="flex items-center gap-1 text-[11px] leading-tight" style={{ color: colors.textSecondary }}>
                        {ride.scheduled_for && <CalendarClock size={10} />}
                        {when}
                        {requester.rating.count > 0 && (
                            <>
                                <span>·</span>
                                <Star size={10} className="fill-current" style={{ color: '#eab308' }} />
                                {requester.rating.avg.toFixed(1).replace('.', ',')}
                            </>
                        )}
                    </p>
                </div>
            </div>}

            {embedded && options.length > 0 && (
                <div className="flex flex-col gap-1.5" role={viewOnly ? undefined : 'group'} aria-label="Escolha os valores">
                    <p className="text-[12px] font-black flex items-baseline justify-between gap-2" style={{ color: colors.textSecondary }}>
                        <span>{viewOnly ? 'Valores desta corrida' : 'Escolha até 3 valores'}</span>
                        {!viewOnly && <span className="text-[11px] font-bold">o passageiro escolhe um</span>}
                    </p>
                    {options.map((o) => {
                        const on = !viewOnly && keys.includes(o.key)
                        const h = perHour(o.value)
                        const low = below(o.value)
                        return (
                            <button key={o.key} type="button" role={viewOnly ? undefined : 'checkbox'} aria-checked={viewOnly ? undefined : on} disabled={viewOnly} onClick={() => toggle(o.key)}
                                className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left transition active:scale-[0.99] disabled:active:scale-100"
                                style={{ border: `1.5px solid ${on ? '#f97316' : colors.border}`, background: on ? '#f9731610' : 'transparent' }}>
                                {!viewOnly && <span className="w-[18px] h-[18px] rounded-md flex items-center justify-center flex-shrink-0" style={{ border: `2px solid ${on ? '#f97316' : colors.border}`, background: on ? '#f97316' : 'transparent' }}>{on && <Check size={12} color="#fff" strokeWidth={3.5} />}</span>}
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[13px] font-black leading-tight" style={{ color: colors.textPrimary }}>{o.label}</span>
                                    {(h != null || o.tag || low) && (
                                        <span className="block text-[11px] font-semibold leading-tight mt-0.5" style={{ color: low ? '#d97706' : colors.textSecondary }}>
                                            {[h != null ? `R$ ${h} por hora` : '', o.tag ?? '', low ? 'abaixo do seu mínimo' : ''].filter(Boolean).join(' · ')}
                                        </span>
                                    )}
                                </span>
                                <span className="text-[17px] font-black tabular-nums flex-shrink-0" style={{ color: on ? '#ea580c' : colors.textPrimary }}>{brl(o.value)}</span>
                            </button>
                        )
                    })}
                    {!viewOnly && (!outroOpen ? (
                        <button type="button" role="checkbox" aria-checked={false} onClick={() => toggle('outro')} className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left transition active:scale-[0.99]" style={{ border: `1.5px dashed ${colors.border}` }}>
                            <span className="w-[18px] h-[18px] rounded-md flex-shrink-0" style={{ border: `2px solid ${colors.border}` }} />
                            <span className="min-w-0 flex-1">
                                <span className="block text-[13px] font-black leading-tight" style={{ color: colors.textPrimary }}>Outro valor</span>
                                {range && <span className="block text-[11px] font-semibold leading-tight mt-0.5" style={{ color: colors.textSecondary }}>só para cima · até {brl(range.max)}</span>}
                            </span>
                            <Pencil size={15} style={{ color: colors.textSecondary }} />
                        </button>
                    ) : (
                        <div role="checkbox" aria-checked className="rounded-2xl px-3 py-3 flex flex-col gap-2" style={{ border: '1.5px solid #f97316', background: '#f9731610' }}>
                            <div className="flex items-center gap-2.5">
                                <span className="w-[18px] h-[18px] rounded-md flex items-center justify-center flex-shrink-0" style={{ background: '#f97316' }}><Check size={12} color="#fff" strokeWidth={3.5} /></span>
                                <span className="text-[13px] font-black flex-1" style={{ color: colors.textPrimary }}>Outro valor</span>
                                <button type="button" onClick={() => { setOutro(''); setLimitHint(false); setMarked(keys.length > 1 ? keys.filter((k) => k !== 'outro') : initialKey ? [initialKey] : []) }} aria-label="Tirar o outro valor" className="w-7 h-7 rounded-full flex items-center justify-center" style={{ color: colors.textSecondary }}><X size={15} /></button>
                            </div>
                            {/* digitado como na maquininha: o R$ e a vírgula ficam à vista enquanto se digita */}
                            <label className="flex items-center gap-1.5 rounded-2xl px-4 h-14" style={{ background: colors.background, border: `1.5px solid ${outro && outroProblem ? '#dc2626' : colors.border}` }}>
                                <span className="text-[18px] font-black" style={{ color: colors.textSecondary }}>R$</span>
                                <input autoFocus inputMode="numeric" aria-label="Outro valor em reais" value={outro ? centsLabel(outro) : ''} placeholder="0,00"
                                    onChange={(e) => setOutro(centsDigits(e.target.value))}
                                    onKeyDown={(e) => { if (e.key === 'Enter') sendNow() }}
                                    className="flex-1 min-w-0 bg-transparent outline-none text-[26px] font-black tabular-nums" style={{ color: colors.textPrimary }} />
                            </label>
                            <p className="text-[11px] font-bold leading-snug" style={{ color: outro && outroProblem ? '#dc2626' : colors.textSecondary }}>
                                {outro && outroProblem ? outroProblem : range ? `De ${brl(range.min)} até ${brl(range.max)}${typed != null && perHour(typed) != null ? ` · R$ ${perHour(typed)} por hora` : ''}` : ''}
                            </p>
                            {outro && !outroProblem && curBlocked && <p className="text-[11px] font-bold leading-snug" style={{ color: '#dc2626' }}>{curBlocked}</p>}
                            <button type="button" onClick={sendNow} disabled={applying || !packed || !!curBlocked}
                                className="h-12 rounded-full text-[14px] font-black text-white flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-45" style={{ background: '#f97316' }}>
                                {applying ? <Spinner size={14} /> : !packed ? 'Enviar valor' : packed.alts.length ? `Enviar ${packed.alts.length + 1} valores` : `Enviar valor · ${brl(packed.price)}`}
                            </button>
                        </div>
                    ))}
                    {!viewOnly && limitHint && <p className="text-[11px] font-bold" style={{ color: '#b45309' }}>No máximo {MAX_OFFER_VALUES} valores: desmarque um para trocar.</p>}
                    {/* valor que não pode ser enviado: o motivo aparece no próprio deslizar, logo abaixo */}
                    {!viewOnly && curValue != null && !curBlocked && below(curValue) && minHourly != null && perHour(curValue) != null && (
                        <p className="text-[11px] font-bold leading-snug" style={{ color: '#b45309' }}>{belowMinimumText(perHour(curValue) as number, minHourly, 'proposta')}</p>
                    )}
                    {onEditTariff && (
                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                            Ajustar minha tarifa:{' '}
                            <button type="button" onClick={() => onEditTariff('km')} className="font-black underline" style={{ color: colors.textPrimary }}>por km</button>{' · '}
                            <button type="button" onClick={() => onEditTariff('tempo')} className="font-black underline" style={{ color: colors.textPrimary }}>por tempo</button>
                        </p>
                    )}
                </div>
            )}
            {embedded && (
                <button type="button" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore} className="flex items-center justify-center gap-1 text-[12px] font-bold py-1" style={{ color: colors.textSecondary }}>
                    {showMore ? 'Esconder detalhes da corrida' : 'Ver detalhes da corrida'} <ChevronDown size={14} style={{ transform: showMore ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }} />
                </button>
            )}

            {(!embedded || showMore) && <>
            {/* Resumo em lista: veículo, o que leva, pagamento... uma linha cada, com ícone e cor */}
            <div className="flex flex-col gap-1">
                {[
                    { kind: 'vehicle' as const, text: vehicleLabel },
                    ...(ride.order_id ? [{ kind: 'store' as const, text: `Entrega${storeName ? ` · ${storeName}` : ' de loja'}` }] : []),
                    ...specs,
                ].map((item, i) => {
                    const { icon: Icon, color } = SPEC_STYLE[item.kind]
                    return (
                        <div key={i} className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${color}22`, color }}>
                                <Icon size={11} />
                            </span>
                            <span className="text-xs font-semibold leading-tight" style={{ color: colors.textPrimary }}>{item.text}</span>
                        </div>
                    )
                })}
            </div>

            {miniMap}

            {/* De onde pra onde (o card enxuto já diz; aberto dentro dele sobram só as paradas) */}
            {embedded ? ((ride.stop1_address || ride.stop2_address) ? (
                <p className="text-[11px] leading-tight" style={{ color: colors.textSecondary }}>Paradas: {[ride.stop1_address, ride.stop2_address].filter(Boolean).map((a) => placeLabel(a as string)).join(' · ')}</p>
            ) : null) : <div className="flex items-stretch gap-2.5">
                <div className="flex flex-col items-center py-1 flex-shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#22c55e' }} />
                    <span className="flex-1 w-px my-0.5" style={{ background: colors.border }} />
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: TRIP_COLOR }} />
                </div>
                <div className="min-w-0 flex flex-col justify-between gap-1">
                    <p className="text-xs font-semibold leading-tight" style={{ color: colors.textPrimary }}>
                        <span className="font-normal" style={{ color: colors.textSecondary }}>Busca em </span>{placeLabel(ride.origin_address)}
                    </p>
                    {(ride.stop1_address || ride.stop2_address) && (
                        <p className="text-[11px] leading-tight" style={{ color: colors.textSecondary }}>
                            Paradas: {[ride.stop1_address, ride.stop2_address].filter(Boolean).map((a) => placeLabel(a as string)).join(' · ')}
                        </p>
                    )}
                    <p className="text-xs font-semibold leading-tight" style={{ color: colors.textPrimary }}>
                        <span className="font-normal" style={{ color: colors.textSecondary }}>Leva até </span>{placeLabel(ride.destination_address)}
                    </p>
                </div>
            </div>}

            {/* Quanto falta: cores iguais às linhas do mapa */}
            <div className="flex gap-1.5">
                {!compact && stat(TO_PICKUP_COLOR, 'Até buscar', toPickup.km, toPickup.min, toPickup.hasGps ? 'calculando…' : 'ative o GPS', parts?.pickup ?? null)}
                {stat(TRIP_COLOR, 'A corrida', trip.km, trip.min, 'calculando…', parts?.trip ?? null)}
                {!compact && stat('#a855f7', 'Total', totalKm, totalMin, '—', parts?.total ?? null)}
            </div>
            {!compact && parts && (
                <p className="text-[10px] -mt-1" style={{ color: colors.textSecondary }}>Valores pela {partsLabel}{parts.pickup == null ? ' (sem o deslocamento: falta a sua posição)' : ''}</p>
            )}
            {!compact && arrivalTime && (
                <p className="text-[11px] -mt-1" style={{ color: colors.textSecondary }}>
                    Se sair agora, termina por volta das <span className="font-black" style={{ color: colors.textPrimary }}>{arrivalTime}</span>
                </p>
            )}
            {embedded && options.length > 0 && notes}
            </>}

            {/* Valor já definido: mesmo desenho das tarifas, com o ganho por hora */}
            {valueBox && (
                <div className="rounded-xl px-3 py-1.5" style={{ background: GRADIENT, color: '#fff' }}>
                    <span className="block text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>{valueBox.label}</span>
                    <span className="block text-[15px] font-black leading-tight">{brl(valueBox.price)}</span>
                    {perHour(valueBox.price) != null && (
                        <span className="block text-[9px] leading-tight font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>≈ R$ {perHour(valueBox.price)}/h</span>
                    )}
                </div>
            )}

            {/* Valores: Tarifa iUser · Minha tarifa · outro valor (ou o frete da loja) */}
            {footer}

            {!footer && onApply && (ride.offered_price != null ? (viewOnly ? (
                <div className="rounded-xl px-3 py-2" style={{ background: '#22c55e14', border: '1px solid #22c55e40' }}>
                    <span className="block text-[10px] font-semibold" style={{ color: colors.textSecondary }}>Frete desta entrega</span>
                    <span className="block text-[17px] font-black leading-tight" style={{ color: '#16a34a' }}>{brl(Number(ride.offered_price))}</span>
                    {perHour(Number(ride.offered_price)) != null && <span className="block text-[10px] font-semibold leading-tight" style={{ color: colors.textSecondary }}>≈ R$ {perHour(Number(ride.offered_price))}/h</span>}
                </div>
            ) : (
                <>
                <button
                    onClick={() => onApply(Number(ride.offered_price))}
                    disabled={applying}
                    className="w-full py-2.5 rounded-full text-[13px] font-black transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                    style={{ background: GRADIENT, color: '#fff' }}
                >
                    {applying ? <Spinner size={14} /> : `Aceitar frete de ${brl(Number(ride.offered_price))}`}
                </button>
                    {ride.order_id && (
                        <>
                            {onCounter && customPrice != null && customPrice > Number(ride.offered_price) ? (
                                <button
                                    onClick={onCounter}
                                    disabled={applying}
                                    className="w-full rounded-2xl px-3 py-2 text-center transition-all active:scale-95 disabled:opacity-70"
                                    style={{ background: 'transparent', border: v3 ? 'none' : `1.5px solid ${colors.border}` }}
                                >
                                    <span className="block text-[13px] font-black" style={{ color: colors.textPrimary }}>Propor a minha tarifa · {brl(customPrice)}</span>
                                    <span className="block text-[10px] font-semibold" style={{ color: colors.textSecondary }}>O cliente decide se autoriza esse valor</span>
                                </button>
                            ) : (
                                <p className="text-[11px] text-center" style={{ color: colors.textSecondary }}>
                                    Frete desta entrega: você aceita ou não.
                                </p>
                            )}
                        </>
                    )}
                </>
            )) : embedded ? null : ride.passenger_offer != null ? (
                // NEGOCIAÇÃO: o passageiro ofereceu um valor. Referência, oferta e minha tarifa lado a lado, com o ganho por hora de cada uma.
                (() => {
                    const offer = Number(ride.passenger_offer)
                    const mine = myFare ?? iuserSuggestion ?? platformPrice
                    const mineLabel = customPrice != null ? (myTime != null ? 'Minha tarifa · km' : 'Minha tarifa') : iuserSuggestion != null ? 'Minha tarifa · sugestão do iUser' : 'Minha tarifa · sugestão do iUser'
                    const offerBelow = below(offer)
                    const offerBlocked = blocked(offer)
                    const row = (label: string, value: number, strong = false, hour: number | null = null, warn = false) => (
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[12px] font-semibold min-w-0 truncate" style={{ color: strong ? colors.textPrimary : colors.textSecondary }}>{label}</span>
                            <span className="text-right flex-shrink-0">
                                <span className={`${strong ? 'text-[17px]' : 'text-[14px]'} font-black leading-tight`} style={{ color: strong ? '#16a34a' : colors.textPrimary }}>{brl(value)}</span>
                                {hour != null && <span className="block text-[10px] font-bold leading-tight" style={{ color: warn ? '#d97706' : colors.textSecondary }}>≈ R$ {hour}/h</span>}
                            </span>
                        </div>
                    )
                    const quick = quickValues(mine, { count: 4 })
                    const counterVal = parseMoney(value)
                    const counterErr = counterVal != null ? validateAmount(counterVal) : null
                    return (
                        <>
                            <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: v3 ? `${colors.border}25` : `${colors.border}20`, border: bd }}>
                                {row('Tarifa iUser', platformPrice, false, perHour(platformPrice))}
                                {row('Oferta do passageiro', offer, true, perHour(offer), offerBelow)}
                                {row(mineLabel, mine, false, perHour(mine), below(mine))}
                                {myTime != null && row('Minha tarifa · tempo', myTime, false, perHour(myTime), below(myTime))}
                                {floorRaised && myFareWhy && (
                                    <p className="text-[10px] leading-snug" style={{ color: colors.textSecondary }}>{myFareWhy}</p>
                                )}
                            </div>
                            {!viewOnly && belowPlatformFloor(offer, platFloor) && (
                                <p className="text-[11px] font-bold leading-snug rounded-xl px-3 py-2" style={{ background: '#ef44441a', color: '#b91c1c' }}>{platformFloorText(platFloor, minPerMinute)} Essa oferta não pode ser aceita; faça uma contraproposta.</p>
                            )}
                            {offerBelow && minHourly != null && perHour(offer) != null && (
                                <p className="text-[11px] font-bold leading-snug rounded-xl px-3 py-2" style={{ background: '#f59e0b1f', color: '#b45309' }}>
                                    {belowMinimumText(perHour(offer) as number, minHourly)}{protection === 'block' ? ' Você ativou "não aceitar abaixo do mínimo".' : ''}
                                </p>
                            )}
                            {!viewOnly && (<>
                            <button
                                onClick={() => onApply(offer)}
                                disabled={applying || offerBlocked}
                                className="w-full py-3 rounded-full text-[13px] font-black uppercase tracking-wide transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                                style={{ background: GRADIENT, color: '#fff' }}
                            >
                                {applying ? <Spinner size={14} /> : `Aceitar oferta · ${brl(offer)}`}
                            </button>
                            <div className="flex items-stretch gap-1.5">
                                <button
                                    onClick={() => { setCounterOpen((o) => !o); setValue('') }}
                                    className="flex-1 py-2.5 rounded-full text-[12px] font-black uppercase tracking-wide transition-all active:scale-95"
                                    style={counterOpen ? { background: GRADIENT, color: '#fff' } : { background: `${colors.border}30`, color: colors.textPrimary, border: bd }}
                                >
                                    Fazer contraproposta
                                </button>
                                {onSkip && (
                                    <button onClick={onSkip} className="px-4 py-2.5 rounded-full text-[12px] font-black uppercase tracking-wide transition-all active:scale-95" style={{ background: 'transparent', color: '#dc2626', border: v3 ? 'none' : '1.5px solid #dc262655' }}>
                                        Recusar
                                    </button>
                                )}
                            </div>
                            {counterOpen && (
                                <div className="flex flex-col gap-2">
                                    <div className="flex flex-wrap gap-1.5">
                                        {quick.map((q) => (
                                            <button
                                                key={q}
                                                onClick={() => onApply(q)}
                                                disabled={applying || blocked(q)}
                                                className="flex-1 min-w-[64px] rounded-xl px-2 py-2 text-center transition-all active:scale-95 disabled:opacity-40"
                                                style={{ background: `${colors.border}30`, border: bd }}
                                            >
                                                <span className="block text-[14px] font-black leading-tight" style={{ color: colors.textPrimary }}>R$ {q}</span>
                                                {perHour(q) != null && <span className="block text-[9px] font-bold" style={{ color: below(q) ? '#d97706' : colors.textSecondary }}>≈ R$ {perHour(q)}/h</span>}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            inputMode="decimal"
                                            value={value}
                                            onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, '').slice(0, 9))}
                                            placeholder="Outro valor (R$)"
                                            className={v3 ? 'flex-1 min-w-0 px-4 py-2.5 rounded-full text-sm font-semibold outline-none' : 'flex-1 min-w-0 px-3 py-2 rounded-full border text-sm'}
                                            style={v3 ? { background: colors.background, color: colors.textPrimary } : { background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                        />
                                        <button
                                            onClick={() => counterVal != null && !counterErr && onApply(counterVal)}
                                            disabled={applying || counterVal == null || !!counterErr || blocked(counterVal)}
                                            className="px-4 py-2.5 rounded-full text-xs font-black disabled:opacity-50"
                                            style={{ background: GRADIENT, color: '#fff' }}
                                        >
                                            {applying ? <Spinner size={12} /> : 'Enviar'}
                                        </button>
                                    </div>
                                    {counterVal != null && blocked(counterVal) && minHourly != null && (
                                        <p className="text-[11px] font-bold" style={{ color: '#b45309' }}>{belowMinimumText(perHour(counterVal) as number, minHourly, 'proposta')}</p>
                                    )}
                                </div>
                            )}
                            </>)}
                        </>
                    )
                })()
            ) : (
                <>
                    <div className="flex items-stretch gap-1.5">
                        <button
                            onClick={() => onApply(platformPrice)}
                            disabled={applying || blocked(platformPrice)}
                            className="flex-1 min-w-0 rounded-xl px-2 py-1.5 text-left transition-all active:scale-95 disabled:opacity-70"
                            style={{ background: `${colors.border}25`, border: bd }}
                        >
                            <span className="block text-[10px] font-semibold" style={{ color: colors.textSecondary }}>{pickup && pickup.state !== 'ready' ? 'iUser · a partir de' : 'Tarifa iUser'}</span>
                            <span className="block text-[14px] font-black leading-tight whitespace-nowrap" style={{ color: colors.textPrimary }}>{brl(platformPrice)}</span>
                            {perHour(platformPrice) != null && (
                                <span className="block text-[9px] leading-tight font-semibold" style={{ color: below(platformPrice) ? '#d97706' : colors.textSecondary }}>≈ R$ {perHour(platformPrice)}/h{below(platformPrice) ? ' · abaixo do seu mínimo' : ''}</span>
                            )}
                        </button>
                        <button
                            onClick={() => {
                                // "Minha tarifa" (definida ou não) leva à tarifa personalizada; só a SUGESTÃO do iUser (ainda não é tarifa dele) manda a proposta
                                if (iuserSuggestion != null && myFare == null) onApply(iuserSuggestion)
                                else onEditTariff?.('km')
                            }}
                            disabled={applying || (iuserSuggestion != null && myFare == null && blocked(iuserSuggestion)) || (iuserSuggestion == null && myFare == null && !onEditTariff)}
                            className="flex-1 min-w-0 rounded-xl px-2 py-1.5 text-left transition-all active:scale-95 disabled:opacity-70"
                            style={myFare != null ? { background: GRADIENT, color: '#fff' } : { background: `${colors.border}15`, border: v3 ? 'none' : `1px dashed ${colors.border}` }}
                        >
                            <span className="block text-[10px] font-semibold" style={{ color: myFare != null ? 'rgba(255,255,255,0.85)' : colors.textSecondary }}>{myFare != null ? 'Por km' : iuserSuggestion != null ? 'Sugestão iUser' : 'Por km'}</span>
                            <span className="block text-[14px] font-black leading-tight whitespace-nowrap" style={{ color: myFare != null ? '#fff' : colors.textSecondary }}>
                                {myFare != null ? brl(myFare) : iuserSuggestion != null ? brl(iuserSuggestion) : 'não definida'}
                            </span>
                            {(myFare ?? iuserSuggestion) != null && perHour((myFare ?? iuserSuggestion) as number) != null && (
                                <span className="block text-[9px] leading-tight font-semibold" style={{ color: myFare != null ? 'rgba(255,255,255,0.85)' : colors.textSecondary }}>≈ R$ {perHour((myFare ?? iuserSuggestion) as number)}/h{myFareDriver === 'platform' ? ' · mín. plataforma' : myFareDriver === 'hourly' ? ' · seu mínimo' : ''}</span>
                            )}
                            {onEditTariff && myFare != null && (
                                <span className="block text-[9px] leading-tight font-bold mt-0.5 underline" style={{ color: 'rgba(255,255,255,0.9)' }}>editar</span>
                            )}
                            {onEditTariff && myFare == null && iuserSuggestion == null && (
                                <span className="block text-[9px] leading-tight font-bold mt-0.5 underline" style={{ color: colors.textSecondary }}>definir</span>
                            )}
                        </button>
                        <button
                            onClick={() => onEditTariff?.('tempo')}
                            disabled={applying || !onEditTariff}
                            className="flex-1 min-w-0 rounded-xl px-2 py-1.5 text-left transition-all active:scale-95 disabled:opacity-70"
                            style={myTime != null ? { background: TIME_GRADIENT, color: '#fff' } : { background: `${colors.border}15`, border: v3 ? 'none' : `1px dashed ${colors.border}` }}
                        >
                            <span className="block text-[10px] font-semibold" style={{ color: myTime != null ? 'rgba(255,255,255,0.85)' : colors.textSecondary }}>Por tempo</span>
                            <span className="block text-[14px] font-black leading-tight whitespace-nowrap" style={{ color: myTime != null ? '#fff' : colors.textSecondary }}>{myTime != null ? brl(myTime) : 'não definida'}</span>
                            {myTime != null && perHour(myTime) != null && (
                                <span className="block text-[9px] leading-tight font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>≈ R$ {perHour(myTime)}/h{timeFloorRaised ? ' · mínimo' : ''}</span>
                            )}
                            {myTime != null && timeIsDefault && (
                                <span className="block text-[9px] leading-tight font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>padrão iUser</span>
                            )}
                            {onEditTariff && (
                                <span className="block text-[9px] leading-tight font-bold mt-0.5 underline" style={{ color: myTime != null ? 'rgba(255,255,255,0.9)' : colors.textSecondary }}>{myTime != null ? (timeIsDefault ? 'definir o meu' : 'editar') : rateUsed != null ? 'sem minutos' : 'definir'}</span>
                            )}
                        </button>
                        {!viewOnly && <button
                            onClick={() => {
                                if (editing) { setEditing(false); setValue('') }
                                else { setEditing(true); setValue((myFare ?? iuserSuggestion ?? platformPrice).toFixed(2)) }
                            }}
                            className="w-9 rounded-xl flex flex-col items-center justify-center flex-shrink-0 transition-all active:scale-95"
                            style={editing ? { background: GRADIENT, color: '#fff' } : { background: `${colors.border}30`, color: colors.textSecondary, border: bd }}
                            title="Digitar outro valor"
                        >
                            <Pencil size={14} />
                            <span className="text-[9px] font-semibold mt-0.5">outro</span>
                        </button>}
                    </div>

                    {notes}

                    {editing && belowPlatformFloor(parseFloat(value) || 0, platFloor) && (
                        <p className="text-[11px] font-bold" style={{ color: '#b45309' }}>{platformFloorText(platFloor, minPerMinute)}</p>
                    )}
                    {editing && (
                        <div className="flex gap-1.5">
                            {[{ k: 'iUser', v: platformPrice }, { k: 'Por km', v: myFare }, { k: 'Por tempo', v: myTime }].filter((c) => c.v != null).map((c) => (
                                <button key={c.k} onClick={() => setValue((c.v as number).toFixed(2))} className="flex-1 rounded-xl px-2 py-1.5 text-center transition-all active:scale-95" style={{ background: `${colors.border}30`, border: bd }}>
                                    <span className="block text-[9px] font-semibold" style={{ color: colors.textSecondary }}>{c.k}</span>
                                    <span className="block text-[12px] font-black" style={{ color: colors.textPrimary }}>{brl(c.v as number)}</span>
                                </button>
                            ))}
                        </div>
                    )}
                    {editing && (
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                inputMode="decimal"
                                autoFocus
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                placeholder="Quanto você cobra? (R$)"
                                className={v3 ? 'flex-1 min-w-0 px-4 py-2.5 rounded-full text-sm font-semibold outline-none' : 'flex-1 min-w-0 px-3 py-2 rounded-full border text-sm'}
                                style={v3 ? { background: colors.background, color: colors.textPrimary } : { background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                            />
                            <button
                                onClick={() => onApply(parseFloat(value) || 0)}
                                disabled={applying || blocked(parseFloat(value) || 0)}
                                className="px-4 py-2 rounded-full text-xs font-black disabled:opacity-70"
                                style={{ background: GRADIENT, color: '#fff' }}
                            >
                                {applying ? <Spinner size={12} /> : 'Enviar'}
                            </button>
                            <button
                                onClick={() => { setEditing(false); setValue('') }}
                                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ background: `${colors.border}30`, color: colors.textSecondary }}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    )}
                </>
            ))}

            {after}

            {onSkip ? (
                <button onClick={onSkip} className="w-full py-1 text-xs font-semibold" style={{ color: colors.textSecondary }}>
                    Pular esta corrida
                </button>
            ) : onBack ? (
                <button onClick={onBack} className="w-full py-1 text-xs font-semibold" style={{ color: colors.textSecondary }}>
                    ← Voltar às corridas
                </button>
            ) : null}
        </div>
    )
}
