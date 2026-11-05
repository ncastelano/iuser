// components/AceitarCorridas/RideSummaryCard.tsx
//
// Card ENXUTO de uma corrida (Canal do Motorista da home): em linguagem simples e com o VALOR em destaque — quem pediu, quanto rende, de onde até onde,
// quanto falta — e, quando o passageiro paga acima da Tarifa iUser, o selo de corrida valorizada (regra em modules/negotiation: `rideValuation`).
// Todo o técnico (Tarifa iUser, Minha tarifa, pisos, mapa grande) fica no botão "Detalhes", que abre `details` (o RideOfferCard completo, só leitura).
// Desenho aprovado em /paginateste?lab=corrida.
'use client'

import { useState, type ReactNode } from 'react'
import { ArrowRight, Bike, Car, ChevronDown, Clock, Flame, TrendingUp, Truck, type LucideIcon } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import PlanAvatarRing from '@/components/PlanAvatarRing'
import { placeLabel } from '@/lib/serviceBoard'
import { humanizeRideSpecs } from '@/lib/rideSpecs'
import type { VehicleType } from '@/lib/rideVehicle'
import { perHour as perHourOf, rideValuation } from '@/modules/negotiation/domain'
import type { OfferRide, OfferRequester } from './RideOfferCard'

const ORANGE = '#f97316'
const GREEN = '#16a34a'
const GRADIENT = 'linear-gradient(90deg, #f97316, #ef4444)'

const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`
const kmText = (v: number) => `${v.toFixed(1).replace('.', ',')} km`

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

const ASKED_FOR: Record<VehicleType, string> = { carro: 'um carro', van: 'uma van', 'van-grande': 'uma van grande', moto: 'uma moto', bicicleta: 'uma bicicleta', qualquer: 'uma corrida' }
const VEHICLE_ICON: Record<VehicleType, LucideIcon> = { carro: Car, van: Car, 'van-grande': Car, moto: Bike, bicicleta: Bike, qualquer: Car }

function ago(iso: string): string {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (m < 1) return 'agora há pouco'
    if (m < 60) return `há ${m} min`
    const h = Math.floor(m / 60)
    return h < 24 ? `há ${h}h` : `há ${Math.floor(h / 24)}d`
}

interface RideSummaryCardProps {
    ride: OfferRide
    requester: OfferRequester
    /** o que o motorista recebe: a oferta do passageiro, o frete da loja ou o valor da tarifa que vale para ele */
    price: number
    /** só uma estimativa (ainda não dá para somar o deslocamento até a partida) */
    approx?: boolean
    /** a Tarifa iUser desta corrida (com o deslocamento): base para dizer que está valorizada */
    reference: number
    /** quando o valor do card é a oferta do passageiro (só aí faz sentido falar em "valorizada") */
    fromPassenger: boolean
    /** minutos de trabalho (ir buscar + corrida); null = ainda não dá para dizer quanto rende por hora */
    totalMin: number | null
    toPickup: { km: number | null; min: number | null; hasGps: boolean }
    trip: { km: number | null; min: number | null }
    /** miniatura do mapa (RideMiniMap thumb) */
    thumb?: ReactNode
    onOpen: () => void
    /** o card completo, só leitura (RideOfferCard viewOnly): aparece no "Detalhes" */
    details: ReactNode
}

export function RideSummaryCard({ ride, requester, price, approx = false, reference, fromPassenger, totalMin, toPickup, trip, thumb, onOpen, details }: RideSummaryCardProps) {
    const { colors } = useTheme()
    const [open, setOpen] = useState(false)
    const isStore = !!ride.order_id
    const { tier, extra } = fromPassenger && !isStore ? rideValuation(price, reference) : { tier: 'none' as const, extra: 0 }
    const hot = tier === 'great'
    const accent = tier === 'none' ? colors.textPrimary : hot ? '#ea580c' : GREEN
    const name = requester.name || (requester.slug ? `@${requester.slug}` : 'Passageiro')
    const KindIcon = isStore ? Truck : VEHICLE_ICON[ride.vehicle_type] ?? Car
    const waited = Math.floor((Date.now() - new Date(ride.created_at).getTime()) / 60000)
    const perHour = perHourOf(price, totalMin)
    const spec = humanizeRideSpecs(ride)[0]
    const when = ride.scheduled_for
        ? `agendada para ${new Date(ride.scheduled_for).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
        : ago(ride.created_at)

    return (
        <article className="rounded-3xl overflow-hidden" style={{ background: colors.surface, border: `1px solid ${hot ? `${ORANGE}66` : colors.border}`, boxShadow: hot ? `0 10px 30px ${ORANGE}26` : colors.shadow }}>
            {tier !== 'none' && (
                <div className="flex items-center gap-2 px-4 py-2 text-[12px] font-black" style={{ background: hot ? GRADIENT : `${GREEN}1a`, color: hot ? '#fff' : GREEN }}>
                    {hot ? <Flame size={15} /> : <TrendingUp size={15} />}
                    <span>{hot ? 'Corrida valorizada' : 'Paga acima do normal'}</span>
                    <span className="ml-auto font-bold opacity-90">{brl(extra)} a mais</span>
                </div>
            )}

            <div className="p-4 flex flex-col gap-3">
                {/* quem pediu, em uma linha */}
                <div className="flex items-center gap-2.5">
                    <PlanAvatarRing userId={requester.id}>
                        {requester.avatarUrl ? (
                            <img src={requester.avatarUrl} className="w-9 h-9 rounded-full object-cover flex-shrink-0" alt="" />
                        ) : (
                            <span className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[14px] font-black flex-shrink-0" style={{ background: ORANGE }}>{name.charAt(0).toUpperCase()}</span>
                        )}
                    </PlanAvatarRing>
                    <p className="min-w-0 text-[13px] leading-tight">
                        <strong className="font-black">{name}</strong>{' '}
                        <span style={{ color: colors.textSecondary }}>{isStore ? 'pediu uma entrega' : `pediu ${ASKED_FOR[ride.vehicle_type] ?? 'uma corrida'}`} · {when}</span>
                    </p>
                </div>

                {/* O VALOR */}
                <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                        {approx && <p className="text-[11px] font-bold mb-0.5" style={{ color: colors.textSecondary }}>a partir de</p>}
                        <Money value={price} color={accent} />
                        <p className="text-[13px] font-black mt-1.5" style={{ color: tier === 'none' ? colors.textSecondary : accent }}>
                            {perHour != null ? `dá uns R$ ${Math.round(perHour)} por hora` : toPickup.hasGps ? 'calculando quanto rende…' : 'ative o GPS para ver quanto rende por hora'}
                        </p>
                    </div>
                    {thumb && <div className="w-[118px] h-[78px] rounded-2xl overflow-hidden flex-shrink-0" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>{thumb}</div>}
                </div>

                {/* o trajeto, como se contaria a um amigo */}
                <p className="text-[14px] leading-snug">
                    <span className="font-black">{placeLabel(ride.origin_address)}</span>
                    <span style={{ color: colors.textSecondary }}> até </span>
                    <span className="font-black">{placeLabel(ride.destination_address)}</span>
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-bold" style={{ color: colors.textSecondary }}>
                    {toPickup.min != null && <span className="inline-flex items-center gap-1"><Clock size={13} /> você chega em {Math.round(toPickup.min)} min</span>}
                    {trip.min != null && <span className="inline-flex items-center gap-1"><KindIcon size={13} /> corrida de {Math.round(trip.min)} min{trip.km != null ? ` · ${kmText(trip.km)}` : ''}</span>}
                    {spec && <span className="truncate max-w-full">{spec.text}</span>}
                </div>

                {tier !== 'none' && (
                    <p className="text-[12.5px] leading-snug rounded-2xl px-3 py-2" style={{ background: hot ? `${ORANGE}14` : `${GREEN}12` }}>
                        {name} está pagando <strong>{brl(extra)} a mais</strong> que a tarifa do iUser{waited >= 10 ? ` — e espera há ${waited < 60 ? `${waited} min` : `${Math.floor(waited / 60)}h`}` : ''}.
                    </p>
                )}

                <button onClick={onOpen} className="h-12 rounded-full text-white text-[14px] font-black flex items-center justify-center gap-2 active:scale-[0.98] transition" style={{ background: hot ? GRADIENT : ORANGE }}>
                    Ver corrida e me candidatar <ArrowRight size={17} />
                </button>

                <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex items-center justify-center gap-1 text-[12px] font-bold py-0.5" style={{ color: colors.textSecondary }}>
                    {open ? 'Esconder detalhes' : 'Detalhes'} <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }} />
                </button>
                {open && <div className="rounded-2xl p-3" style={{ background: `${colors.border}14`, border: `1px solid ${colors.border}` }}>{details}</div>}
            </div>
        </article>
    )
}
