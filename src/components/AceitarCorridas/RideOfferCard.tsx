// components/AceitarCorridas/RideOfferCard.tsx
//
// Card de uma corrida — usado na lista de /aceitar-corridas e na prévia em
// /aceitar-corridas/mapa?ride=<id>. Mesmo conteúdo (tipo de veículo, o que a
// corrida envolve, quem pediu, trajeto, Tarifa iUser / Minha tarifa e o
// lápis pra digitar outro valor), só que dentro do card embaixo do mapa.
'use client'

import { useState, type ReactNode } from 'react'
import { Package, PawPrint, Star, CalendarClock, Pencil, X, Users } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import { shortAddress } from '@/lib/serviceBoard'
import { buildRideSpecRows, type RideSpecFields } from '@/lib/rideSpecs'
import { VEHICLE_TYPE_LABELS, type VehicleType } from '@/lib/rideVehicle'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
export const TO_PICKUP_COLOR = '#3b82f6'
export const TRIP_COLOR = '#ef4444'

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
}

export interface OfferRequester {
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
    applying?: boolean
    onApply?: (price: number) => void
    toPickup: { km: number | null; min: number | null; hasGps: boolean }
    trip: { km: number | null; min: number | null }
    // Mini mapa (lista) entra entre os chips e o trajeto.
    miniMap?: ReactNode
    // Substitui as tarifas (ex: "Aguardando decisão" nas candidaturas).
    footer?: ReactNode
    onBack?: () => void
    onSkip?: () => void
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
export function RideOfferCard({ ride, requester, storeName, platformPrice = 0, customPrice = null, toPickup, trip, applying = false, onApply, miniMap, footer, onBack, onSkip }: RideOfferCardProps) {
    const { colors } = useTheme()
    const [editing, setEditing] = useState(false)
    const [value, setValue] = useState('')

    const haveTotal = toPickup.km != null && toPickup.min != null && trip.km != null && trip.min != null
    const totalKm = haveTotal ? (toPickup.km as number) + (trip.km as number) : null
    const totalMin = haveTotal ? (toPickup.min as number) + (trip.min as number) : null
    const arrivalTime = totalMin != null
        ? new Date(Date.now() + totalMin * 60000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : null

    const name = requester.name || (requester.slug ? `@${requester.slug}` : 'Passageiro')
    const when = ride.scheduled_for ? `agendada pra ${formatScheduledFor(ride.scheduled_for)}` : `pediu ${relativeTime(ride.created_at)}`
    const specs = buildRideSpecRows(ride)

    const stat = (color: string, label: string, km: number | null, min: number | null, pending: string) => (
        <div className="flex-1 min-w-0 rounded-xl px-2.5 py-1.5" style={{ background: `${colors.border}25`, border: `1px solid ${colors.border}` }}>
            <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: colors.textSecondary }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                {label}
            </span>
            <span className="block text-[11px] font-black leading-tight mt-0.5" style={{ color: colors.textPrimary }}>
                {km != null ? `${kmText(km)}${min != null ? ` · ${Math.round(min)} min` : ''}` : pending}
            </span>
        </div>
    )

    return (
        <div className="flex flex-col gap-2">
            {/* Quem pediu e quando */}
            <div className="flex items-center gap-2">
                {requester.avatarUrl ? (
                    <img src={requester.avatarUrl} className="w-8 h-8 rounded-full object-cover flex-shrink-0" alt="" />
                ) : (
                    <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black" style={{ background: GRADIENT, color: '#fff' }}>
                        {name.charAt(0).toUpperCase()}
                    </span>
                )}
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
                <span className="text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0" style={{ background: GRADIENT, color: '#fff' }}>
                    {VEHICLE_TYPE_LABELS[ride.vehicle_type]}
                </span>
            </div>

            {/* O que a corrida leva (rola de lado se não couber) */}
            <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5" style={{ scrollbarWidth: 'none' }}>
                {ride.ride_type === 'objeto' && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0" style={{ background: `${colors.border}30`, color: colors.textPrimary }}>
                        <Package size={11} /> {ride.object_description || 'Objeto'}
                    </span>
                )}
                {ride.ride_type === 'animal' && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0" style={{ background: `${colors.border}30`, color: colors.textPrimary }}>
                        <PawPrint size={11} /> {ride.pet_description || 'Animal'}
                    </span>
                )}
                {ride.ride_type === 'pessoa' && ride.passenger_count > 1 && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0" style={{ background: `${colors.border}30`, color: colors.textPrimary }}>
                        <Users size={11} /> {ride.passenger_count} passageiros
                    </span>
                )}
                {ride.order_id && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0" style={{ background: '#22c55e20', color: '#16a34a' }}>
                        <Package size={11} /> Entrega{storeName ? ` · ${storeName}` : ' de loja'}
                    </span>
                )}
                {specs.map((spec, i) => (
                    <span
                        key={i}
                        className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0"
                        style={{ background: `${colors.accent}15`, color: colors.accent }}
                    >
                        {spec.label}: {spec.value}
                    </span>
                ))}
            </div>

            {miniMap}

            {/* De onde pra onde */}
            <div className="flex items-stretch gap-2.5">
                <div className="flex flex-col items-center py-1 flex-shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#22c55e' }} />
                    <span className="flex-1 w-px my-0.5" style={{ background: colors.border }} />
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: TRIP_COLOR }} />
                </div>
                <div className="min-w-0 flex flex-col justify-between gap-1">
                    <p className="text-xs font-semibold leading-tight" style={{ color: colors.textPrimary }}>
                        <span className="font-normal" style={{ color: colors.textSecondary }}>Busca em </span>{shortAddress(ride.origin_address)}
                    </p>
                    {(ride.stop1_address || ride.stop2_address) && (
                        <p className="text-[11px] leading-tight" style={{ color: colors.textSecondary }}>
                            Paradas: {[ride.stop1_address, ride.stop2_address].filter(Boolean).map((a) => shortAddress(a as string)).join(' · ')}
                        </p>
                    )}
                    <p className="text-xs font-semibold leading-tight" style={{ color: colors.textPrimary }}>
                        <span className="font-normal" style={{ color: colors.textSecondary }}>Leva até </span>{shortAddress(ride.destination_address)}
                    </p>
                </div>
            </div>

            {/* Quanto falta: cores iguais às linhas do mapa */}
            <div className="flex gap-1.5">
                {stat(TO_PICKUP_COLOR, 'Até buscar', toPickup.km, toPickup.min, toPickup.hasGps ? 'calculando…' : 'ative o GPS')}
                {stat(TRIP_COLOR, 'A corrida', trip.km, trip.min, 'calculando…')}
                {stat('#a855f7', 'Total', totalKm, totalMin, '—')}
            </div>
            {arrivalTime && (
                <p className="text-[11px] -mt-1" style={{ color: colors.textSecondary }}>
                    Se sair agora, termina por volta das <span className="font-black" style={{ color: colors.textPrimary }}>{arrivalTime}</span>
                </p>
            )}

            {/* Valores: Tarifa iUser · Minha tarifa · outro valor (ou o frete da loja) */}
            {footer}

            {!footer && onApply && (ride.offered_price != null ? (
                <button
                    onClick={() => onApply(Number(ride.offered_price))}
                    disabled={applying}
                    className="w-full py-2.5 rounded-full text-[13px] font-black transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                    style={{ background: GRADIENT, color: '#fff' }}
                >
                    {applying ? <Spinner size={14} /> : `Aceitar frete de ${brl(Number(ride.offered_price))}`}
                </button>
            ) : (
                <>
                    <div className="flex items-stretch gap-1.5">
                        <button
                            onClick={() => onApply(platformPrice)}
                            disabled={applying}
                            className="flex-1 rounded-xl px-3 py-1.5 text-left transition-all active:scale-95 disabled:opacity-70"
                            style={{ background: `${colors.border}25`, border: `1px solid ${colors.border}` }}
                        >
                            <span className="block text-[10px] font-semibold" style={{ color: colors.textSecondary }}>Tarifa iUser</span>
                            <span className="block text-[15px] font-black leading-tight" style={{ color: colors.textPrimary }}>{brl(platformPrice)}</span>
                        </button>
                        <button
                            onClick={() => customPrice != null && onApply(customPrice)}
                            disabled={applying || customPrice == null}
                            className="flex-1 rounded-xl px-3 py-1.5 text-left transition-all active:scale-95 disabled:opacity-70"
                            style={customPrice != null ? { background: GRADIENT, color: '#fff' } : { background: `${colors.border}15`, border: `1px dashed ${colors.border}` }}
                        >
                            <span className="block text-[10px] font-semibold" style={{ color: customPrice != null ? 'rgba(255,255,255,0.85)' : colors.textSecondary }}>Minha tarifa</span>
                            <span className="block text-[15px] font-black leading-tight" style={{ color: customPrice != null ? '#fff' : colors.textSecondary }}>
                                {customPrice != null ? brl(customPrice) : 'não definida'}
                            </span>
                        </button>
                        <button
                            onClick={() => {
                                if (editing) { setEditing(false); setValue('') }
                                else { setEditing(true); setValue((customPrice ?? platformPrice).toFixed(2)) }
                            }}
                            className="w-11 rounded-xl flex flex-col items-center justify-center flex-shrink-0 transition-all active:scale-95"
                            style={editing ? { background: GRADIENT, color: '#fff' } : { background: `${colors.border}30`, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                            title="Digitar outro valor"
                        >
                            <Pencil size={14} />
                            <span className="text-[9px] font-semibold mt-0.5">outro</span>
                        </button>
                    </div>

                    {editing && (
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                inputMode="decimal"
                                autoFocus
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                placeholder="Quanto você cobra? (R$)"
                                className="flex-1 min-w-0 px-3 py-2 rounded-full border text-sm"
                                style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                            />
                            <button
                                onClick={() => onApply(parseFloat(value) || 0)}
                                disabled={applying}
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
