// app/(main)/acompanhar-corrida/[id]/page.tsx
//
// Página pública (sem login) — pra quem recebeu o link de "compartilhar
// corrida" (porteiro, familiar) acompanhar o essencial: status, endereços e
// quem é o motorista. Não expõe telefone nem exige conta no iUser.
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import { MapPin, Car, CheckCircle2, Clock, XCircle, Navigation, ShieldCheck } from 'lucide-react'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface RideShareData {
    status: 'pending' | 'accepted' | 'completed' | 'cancelled'
    rideType: 'pessoa' | 'objeto' | 'animal'
    requesterFirstName: string
    originAddress: string
    destinationAddress: string
    originComplement: string | null
    destinationComplement: string | null
    distanceKm: number | null
    durationMin: number | null
    driverEnRoute: boolean
    driverArrivedAt: string | null
    createdAt: string
    driver: {
        name: string | null
        avatarUrl: string | null
        carModel: string | null
        carColor: string | null
        carPhotoUrl: string | null
    } | null
}

function shortAddress(address: string): string {
    const firstPart = address.split(',')[0].trim()
    return firstPart.length > 40 ? firstPart.substring(0, 38) + '...' : firstPart
}

export default function AcompanharCorridaPage() {
    const { colors } = useTheme()
    const params = useParams()
    const id = Array.isArray(params.id) ? params.id[0] : params.id

    const [data, setData] = useState<RideShareData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        if (!id) return
        try {
            const res = await fetch(`/api/ride-share/${id}`)
            if (!res.ok) {
                setError('Corrida não encontrada.')
                return
            }
            const json = await res.json()
            setData(json)
        } catch {
            setError('Não foi possível carregar a corrida.')
        } finally {
            setLoading(false)
        }
    }, [id])

    useEffect(() => {
        load()
        const poll = setInterval(load, 15000)
        return () => clearInterval(poll)
    }, [load])

    if (loading) {
        return (
            <div className="min-h-dvh flex items-center justify-center" style={{ background: colors.background }}>
                <Spinner size={40} color={colors.accent} />
            </div>
        )
    }

    if (error || !data) {
        return (
            <div className="min-h-dvh flex flex-col items-center justify-center gap-3 px-4 text-center" style={{ background: colors.background }}>
                <XCircle size={40} style={{ color: '#ef4444' }} />
                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>{error || 'Corrida não encontrada.'}</p>
            </div>
        )
    }

    const statusInfo = (() => {
        if (data.status === 'cancelled') return { label: 'Corrida cancelada', color: '#ef4444', icon: XCircle }
        if (data.status === 'completed') return { label: 'Corrida concluída', color: '#22c55e', icon: CheckCircle2 }
        if (data.status === 'pending') return { label: 'Buscando motorista', color: '#f97316', icon: Clock }
        if (data.driverArrivedAt) return { label: 'Motorista chegou ao local de partida', color: '#22c55e', icon: MapPin }
        if (data.driverEnRoute) return { label: 'Motorista a caminho', color: '#22c55e', icon: Navigation }
        return { label: 'Motorista aceito, aguardando ele sair', color: '#f97316', icon: CheckCircle2 }
    })()
    const StatusIcon = statusInfo.icon

    return (
        <div className="min-h-dvh px-4 py-8" style={{ background: colors.background }}>
            <div className="max-w-md mx-auto flex flex-col gap-4">
                <div className="flex items-center gap-2 justify-center mb-2">
                    <ShieldCheck size={16} style={{ color: colors.textSecondary }} />
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                        Acompanhamento de corrida · iUser
                    </span>
                </div>

                <div
                    className="rounded-2xl p-4"
                    style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                >
                    <div
                        className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3"
                        style={{ background: `${statusInfo.color}15` }}
                    >
                        <StatusIcon size={16} style={{ color: statusInfo.color }} />
                        <span className="text-sm font-black" style={{ color: statusInfo.color }}>{statusInfo.label}</span>
                    </div>

                    <p className="text-xs font-bold mb-1" style={{ color: colors.textSecondary }}>
                        Passageiro: {data.requesterFirstName}
                    </p>

                    <div className="flex items-start gap-2 text-xs mt-2" style={{ color: colors.textPrimary }}>
                        <MapPin size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#22c55e' }} />
                        <div>
                            <span>{shortAddress(data.originAddress)}</span>
                            {data.originComplement && (
                                <p className="text-[10px] mt-0.5" style={{ color: colors.textSecondary }}>📍 {data.originComplement}</p>
                            )}
                        </div>
                    </div>
                    <div className="flex items-start gap-2 text-xs mt-2" style={{ color: colors.textPrimary }}>
                        <MapPin size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
                        <div>
                            <span>{shortAddress(data.destinationAddress)}</span>
                            {data.destinationComplement && (
                                <p className="text-[10px] mt-0.5" style={{ color: colors.textSecondary }}>📍 {data.destinationComplement}</p>
                            )}
                        </div>
                    </div>

                    {data.distanceKm != null && (
                        <p className="text-[11px] mt-2" style={{ color: colors.textSecondary }}>
                            {data.distanceKm.toFixed(1)} km · {Math.round(data.durationMin || 0)} min
                        </p>
                    )}
                </div>

                {data.driver && (data.status === 'accepted' || data.status === 'completed') && (
                    <div
                        className="rounded-2xl p-4 flex items-center gap-3"
                        style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                    >
                        {data.driver.avatarUrl ? (
                            <img src={data.driver.avatarUrl} className="w-12 h-12 rounded-full object-cover flex-shrink-0" alt="" />
                        ) : (
                            <span className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-lg font-black" style={{ background: GRADIENT, color: '#fff' }}>
                                {(data.driver.name || '?').charAt(0).toUpperCase()}
                            </span>
                        )}
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>
                                {data.driver.name || 'Motorista'}
                            </p>
                            {(data.driver.carModel || data.driver.carColor) && (
                                <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: colors.textSecondary }}>
                                    <Car size={12} />
                                    {[data.driver.carModel, data.driver.carColor].filter(Boolean).join(' · ')}
                                </p>
                            )}
                        </div>
                        {data.driver.carPhotoUrl && (
                            <img src={data.driver.carPhotoUrl} className="w-14 h-14 rounded-lg object-cover flex-shrink-0" alt="" />
                        )}
                    </div>
                )}

                <p className="text-[10px] text-center" style={{ color: colors.textSecondary }}>
                    Esta página é só de acompanhamento — atualiza sozinha a cada 15s.
                </p>
            </div>
        </div>
    )
}
