// app/(main)/aceitar-corridas/mapa/RideOfferCard.tsx
//
// Card da prévia de uma corrida disponível em /aceitar-corridas/mapa?ride=<id>
// — mesmo conteúdo do card de /aceitar-corridas (tipo de veículo, o que a
// corrida envolve, quem pediu, trajeto, Tarifa iUser / Minha tarifa e o
// lápis pra digitar outro valor), só que dentro do card embaixo do mapa.
'use client'

import { useState } from 'react'
import { MapPin, Package, PawPrint, Star, CalendarClock, Pencil, X, Route } from 'lucide-react'
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
    platformPrice: number
    customPrice: number | null
    toPickup: { km: number | null; min: number | null; hasGps: boolean }
    trip: { km: number | null; min: number | null }
    applying: boolean
    onApply: (price: number) => void
    onBack: () => void
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

export function RideOfferCard({ ride, requester, storeName, platformPrice, customPrice, toPickup, trip, applying, onApply, onBack }: RideOfferCardProps) {
    const { colors } = useTheme()
    const [editing, setEditing] = useState(false)
    const [value, setValue] = useState('')

    const routeText = `${shortAddress(ride.origin_address)}${ride.stop1_address ? ` → ${shortAddress(ride.stop1_address)}` : ''}${ride.stop2_address ? ` → ${shortAddress(ride.stop2_address)}` : ''} → ${shortAddress(ride.destination_address)}`
    const km = (v: number | null, min: number | null) => (v != null ? `${v.toFixed(1)} km${min != null ? ` · ${Math.round(min)} min` : ''}` : null)

    // Total = até a partida + partida → chegada; "chegada aprox." = agora + total.
    const haveTotal = toPickup.km != null && toPickup.min != null && trip.km != null && trip.min != null
    const totalKm = haveTotal ? (toPickup.km as number) + (trip.km as number) : null
    const totalMin = haveTotal ? (toPickup.min as number) + (trip.min as number) : null
    const arrivalTime = totalMin != null
        ? new Date(Date.now() + totalMin * 60000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : null

    return (
        <div className="flex flex-col gap-2.5">
            {/* Tipo de veículo, o que a corrida envolve e quando foi pedida */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: GRADIENT, color: '#fff' }}>
                        {VEHICLE_TYPE_LABELS[ride.vehicle_type]}
                    </span>
                    {ride.order_id && (
                        <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: '#22c55e20', color: '#16a34a' }}>
                            <Package size={10} />
                            Entrega{storeName ? ` · ${storeName}` : ' de loja'}
                        </span>
                    )}
                    {buildRideSpecRows(ride).map((spec, i) => (
                        <span
                            key={i}
                            className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                            style={{ background: `${colors.accent}15`, color: colors.accent }}
                            title={`${spec.label}: ${spec.value}`}
                        >
                            {spec.label}: {spec.value}
                        </span>
                    ))}
                </div>
                {ride.scheduled_for ? (
                    <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: '#8b5cf615', color: '#8b5cf6' }}>
                        <CalendarClock size={11} />
                        {formatScheduledFor(ride.scheduled_for)}
                    </span>
                ) : (
                    <span className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>{relativeTime(ride.created_at)}</span>
                )}
            </div>

            {/* Quem pediu */}
            <div className="flex items-center gap-2">
                {requester.avatarUrl ? (
                    <img src={requester.avatarUrl} className="w-8 h-8 rounded-full object-cover flex-shrink-0" alt="" />
                ) : (
                    <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black" style={{ background: GRADIENT, color: '#fff' }}>
                        {(requester.name || requester.slug || '?').charAt(0).toUpperCase()}
                    </span>
                )}
                <div className="min-w-0">
                    <p className="text-xs font-black truncate" style={{ color: colors.textPrimary }}>
                        {requester.name || (requester.slug ? `@${requester.slug}` : 'Passageiro')}
                    </p>
                    {requester.rating.count > 0 && (
                        <span className="flex items-center gap-1 text-[10px]" style={{ color: colors.textSecondary }}>
                            <Star size={10} className="fill-current" style={{ color: '#eab308' }} />
                            {requester.rating.avg.toFixed(2)} ({requester.rating.count})
                        </span>
                    )}
                </div>
            </div>

            {/* Percurso no mapa: você → partida → chegada, com km/tempo de cada trecho */}
            <div className="rounded-xl px-3 py-2.5 flex flex-col gap-1.5" style={{ background: `${colors.border}25`, border: `1px solid ${colors.border}` }}>
                <div className="flex items-center gap-3 flex-wrap text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: TO_PICKUP_COLOR }} /> Você</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#22c55e' }} /> Partida</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: TRIP_COLOR }} /> Chegada</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]" style={{ color: colors.textPrimary }}>
                    <span className="w-3 h-1 rounded-full flex-shrink-0" style={{ background: TO_PICKUP_COLOR }} />
                    <span className="font-bold">Até a partida:</span>
                    <span>{km(toPickup.km, toPickup.min) || (toPickup.hasGps ? 'calculando...' : 'ative o GPS pra calcular')}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]" style={{ color: colors.textPrimary }}>
                    <span className="w-3 h-1 rounded-full flex-shrink-0" style={{ background: TRIP_COLOR }} />
                    <span className="font-bold">Partida → chegada:</span>
                    <span>{km(trip.km, trip.min) || 'calculando...'}</span>
                </div>
                {haveTotal && (
                    <>
                        <div className="text-[11px] font-black" style={{ color: colors.textPrimary }}>
                            Total: {km(totalKm, totalMin)}
                        </div>
                        <div className="text-[11px]" style={{ color: colors.textSecondary }}>
                            chegada aprox.: <span className="font-black" style={{ color: colors.textPrimary }}>{arrivalTime}</span>
                        </div>
                    </>
                )}
            </div>

            {/* Trajeto em texto, distância/tempo da corrida e o que leva */}
            <div className="flex items-start gap-2 text-xs" style={{ color: colors.textSecondary }}>
                <MapPin size={12} className="flex-shrink-0 mt-0.5" />
                <span>{routeText}</span>
            </div>
            {trip.km != null && (
                <span className="text-[11px]" style={{ color: colors.textSecondary }}>{km(trip.km, trip.min)}</span>
            )}

            <div className="flex items-center gap-2 text-[11px]" style={{ color: colors.textSecondary }}>
                {ride.ride_type === 'objeto' ? (
                    <span className="flex items-center gap-1"><Package size={11} /> {ride.object_description || 'Objeto'}</span>
                ) : ride.ride_type === 'animal' ? (
                    <span className="flex items-center gap-1"><PawPrint size={11} /> {ride.pet_description || 'Animal'}</span>
                ) : ride.passenger_count > 1 ? (
                    <span>{ride.passenger_count} passageiros</span>
                ) : null}
            </div>

            {/* Valores: Tarifa iUser · Minha tarifa · editar (ou o frete da loja) */}
            {ride.offered_price != null ? (
                <>
                    <div className="rounded-xl px-3 py-2.5 flex items-center justify-between" style={{ background: '#22c55e15', border: '1px solid #22c55e40' }}>
                        <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: '#16a34a' }}>Frete oferecido</span>
                        <span className="text-lg font-black" style={{ color: '#16a34a' }}>R$ {Number(ride.offered_price).toFixed(2)}</span>
                    </div>
                    <button
                        onClick={() => onApply(Number(ride.offered_price))}
                        disabled={applying}
                        className="w-full py-3 rounded-full text-xs font-black uppercase tracking-wider transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                        style={{ background: GRADIENT, color: '#fff' }}
                    >
                        {applying ? <Spinner size={14} /> : `Aceitar frete por R$ ${Number(ride.offered_price).toFixed(2)}`}
                    </button>
                </>
            ) : (
                <>
                    <div className="flex items-stretch gap-2">
                        <button
                            onClick={() => onApply(platformPrice)}
                            disabled={applying}
                            className="flex-1 rounded-xl px-3 py-2 text-left transition-all active:scale-95 disabled:opacity-70"
                            style={{ background: `${colors.border}25`, border: `1px solid ${colors.border}` }}
                        >
                            <span className="block text-[9px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Tarifa iUser</span>
                            <span className="block text-base font-black" style={{ color: colors.textPrimary }}>R$ {platformPrice.toFixed(2)}</span>
                        </button>
                        <button
                            onClick={() => customPrice != null && onApply(customPrice)}
                            disabled={applying || customPrice == null}
                            className="flex-1 rounded-xl px-3 py-2 text-left transition-all active:scale-95 disabled:opacity-70"
                            style={customPrice != null ? { background: GRADIENT, color: '#fff' } : { background: `${colors.border}15`, border: `1px dashed ${colors.border}` }}
                        >
                            <span className="block text-[9px] font-black uppercase tracking-wider" style={{ color: customPrice != null ? 'rgba(255,255,255,0.85)' : colors.textSecondary }}>Minha tarifa</span>
                            <span className="block text-base font-black" style={{ color: customPrice != null ? '#fff' : colors.textSecondary }}>
                                {customPrice != null ? `R$ ${customPrice.toFixed(2)}` : 'não definida'}
                            </span>
                        </button>
                        <button
                            onClick={() => {
                                if (editing) { setEditing(false); setValue('') }
                                else { setEditing(true); setValue((customPrice ?? platformPrice).toFixed(2)) }
                            }}
                            className="w-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-all active:scale-95"
                            style={editing ? { background: GRADIENT, color: '#fff' } : { background: `${colors.border}30`, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                            title="Digitar outro valor"
                        >
                            <Pencil size={16} />
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
                                placeholder="Valor (R$)"
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
            )}

            <button
                onClick={onBack}
                className="w-full py-3 rounded-full text-xs font-black uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-2"
                style={{ background: `${colors.border}30`, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
            >
                <Route size={14} /> Voltar às corridas
            </button>
        </div>
    )
}
