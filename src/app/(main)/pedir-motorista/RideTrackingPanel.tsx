// app/(main)/pedir-motorista/RideTrackingPanel.tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme, type ThemeColors } from '@/app/theme'
import { toast } from 'sonner'
import { shortAddress } from '@/lib/serviceBoard'
import { getAvatarUrl } from '@/lib/avatar'
import { Spinner } from '@/components/Spinner'
import { Check, X, MapPin, Search, CheckCircle2, XCircle, Car, CalendarClock } from 'lucide-react'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

type RideStatus = 'pending' | 'accepted' | 'completed' | 'cancelled'

function formatScheduledFor(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

interface RideRow {
    id: string
    origin_address: string
    destination_address: string
    status: RideStatus
    driver_id: string | null
    created_at: string
    scheduled_for: string | null
}

interface Candidate {
    applicationId: string
    applicantId: string
    status: 'pending' | 'accepted' | 'rejected'
    proposedPrice: number | null
    name: string | null
    profileSlug: string | null
    avatarUrl: string | undefined
}

interface DriverInfo {
    name: string | null
    profileSlug: string | null
    avatarUrl: string | undefined
}

interface RideTrackingPanelProps {
    rideId: string
    onExit: () => void
}

export default function RideTrackingPanel({ rideId, onExit }: RideTrackingPanelProps) {
    const { colors } = useTheme()
    const [loading, setLoading] = useState(true)
    const [ride, setRide] = useState<RideRow | null>(null)
    const [candidates, setCandidates] = useState<Candidate[]>([])
    const [driver, setDriver] = useState<DriverInfo | null>(null)
    const [decidingId, setDecidingId] = useState<string | null>(null)
    const [cancelling, setCancelling] = useState(false)
    const knownCandidateIds = useRef<Set<string>>(new Set())
    const firstLoad = useRef(true)

    const load = useCallback(async () => {
        const { data: rideRow } = await supabase
            .from('ride_requests')
            .select('id, origin_address, destination_address, status, driver_id, created_at, scheduled_for')
            .eq('id', rideId)
            .single()

        if (!rideRow) {
            setLoading(false)
            return
        }
        setRide(rideRow)

        const { data: applications } = await supabase
            .from('ride_applications')
            .select('id, applicant_id, status, proposed_price')
            .eq('ride_request_id', rideId)

        const applicantIds = Array.from(new Set((applications || []).map((a) => a.applicant_id)))
        const idsToFetch = Array.from(new Set([...applicantIds, ...(rideRow.driver_id ? [rideRow.driver_id] : [])]))

        let profilesById = new Map<string, { name: string | null; profileSlug: string | null; avatar_url: string | null }>()
        if (idsToFetch.length > 0) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, name, profileSlug, avatar_url')
                .in('id', idsToFetch)
            profilesById = new Map((profiles || []).map((p) => [p.id, p]))
        }

        const nextCandidates: Candidate[] = (applications || []).map((a) => {
            const p = profilesById.get(a.applicant_id)
            return {
                applicationId: a.id,
                applicantId: a.applicant_id,
                status: a.status,
                proposedPrice: a.proposed_price,
                name: p?.name || null,
                profileSlug: p?.profileSlug || null,
                avatarUrl: getAvatarUrl(supabase, p?.avatar_url),
            }
        })

        // Notifica sobre candidaturas novas desde a última carga (não na primeira).
        if (!firstLoad.current) {
            for (const c of nextCandidates) {
                if (!knownCandidateIds.current.has(c.applicationId)) {
                    toast.info(`${c.name || 'Um motorista'} se candidatou ao seu pedido!`, {
                        description: c.proposedPrice != null ? `Proposta: R$ ${c.proposedPrice.toFixed(2)}` : undefined,
                    })
                }
            }
        }
        knownCandidateIds.current = new Set(nextCandidates.map((c) => c.applicationId))
        firstLoad.current = false

        setCandidates(nextCandidates)

        if (rideRow.driver_id) {
            const p = profilesById.get(rideRow.driver_id)
            setDriver({ name: p?.name || null, profileSlug: p?.profileSlug || null, avatarUrl: getAvatarUrl(supabase, p?.avatar_url) })
        } else {
            setDriver(null)
        }

        setLoading(false)
    }, [rideId])

    useEffect(() => {
        load()
    }, [load])

    // ===== TEMPO REAL: candidaturas novas/alteradas e mudança de status do pedido =====
    useEffect(() => {
        const channel = supabase
            .channel(`ride-tracking-${rideId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'ride_applications', filter: `ride_request_id=eq.${rideId}` },
                () => load()
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'ride_requests', filter: `id=eq.${rideId}` },
                (payload) => {
                    const prevStatus = (payload.old as { status?: RideStatus } | null)?.status
                    const newStatus = (payload.new as { status?: RideStatus } | null)?.status
                    if (newStatus && newStatus !== prevStatus) {
                        if (newStatus === 'accepted') toast.success('Motorista escolhido! Ele está a caminho.')
                        if (newStatus === 'completed') toast.success('Corrida concluída!')
                        if (newStatus === 'cancelled') toast.info('Pedido cancelado.')
                    }
                    load()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [rideId, load])

    const acceptCandidate = async (applicationId: string, applicantId: string) => {
        setDecidingId(applicationId)
        try {
            const { data: updatedRide, error: rideError } = await supabase
                .from('ride_requests')
                .update({ status: 'accepted', driver_id: applicantId })
                .eq('id', rideId)
                .eq('status', 'pending')
                .select('id')

            if (rideError) throw rideError
            if (!updatedRide || updatedRide.length === 0) {
                toast.error('Este pedido já foi decidido.')
                load()
                return
            }

            await supabase.from('ride_applications').update({ status: 'accepted' }).eq('id', applicationId)
            await supabase
                .from('ride_applications')
                .update({ status: 'rejected' })
                .eq('ride_request_id', rideId)
                .eq('status', 'pending')
                .neq('id', applicationId)

            toast.success('Motorista escolhido!')
            load()
        } catch (err: any) {
            toast.error('Erro ao decidir candidatura: ' + (err.message || 'tente novamente'))
        } finally {
            setDecidingId(null)
        }
    }

    const rejectCandidate = async (applicationId: string) => {
        setDecidingId(applicationId)
        try {
            const { error } = await supabase.from('ride_applications').update({ status: 'rejected' }).eq('id', applicationId)
            if (error) throw error
            toast.success('Candidato recusado.')
            load()
        } catch (err: any) {
            toast.error('Erro ao recusar candidatura: ' + (err.message || 'tente novamente'))
        } finally {
            setDecidingId(null)
        }
    }

    const cancelRide = async () => {
        setCancelling(true)
        try {
            const { error } = await supabase
                .from('ride_requests')
                .update({ status: 'cancelled' })
                .eq('id', rideId)
                .eq('status', 'pending')
            if (error) throw error
            toast.success('Pedido cancelado.')
            onExit()
        } catch (err: any) {
            toast.error('Erro ao cancelar: ' + (err.message || 'tente novamente'))
        } finally {
            setCancelling(false)
        }
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Spinner size={22} color={colors.textSecondary} />
                <span className="text-xs" style={{ color: colors.textSecondary }}>Carregando seu pedido...</span>
            </div>
        )
    }

    if (!ride) {
        return (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                <span className="text-sm" style={{ color: colors.textSecondary }}>Não encontramos esse pedido.</span>
                <button onClick={onExit} className="px-4 py-2 rounded-full text-xs font-bold" style={{ background: GRADIENT, color: '#fff' }}>
                    Fazer novo pedido
                </button>
            </div>
        )
    }

    const steps: { key: RideStatus; label: string; icon: typeof Search }[] = [
        { key: 'pending', label: 'Buscando motorista', icon: Search },
        { key: 'accepted', label: 'Motorista a caminho', icon: Car },
        { key: 'completed', label: 'Concluída', icon: CheckCircle2 },
    ]
    const currentStepIndex = ride.status === 'cancelled' ? -1 : steps.findIndex((s) => s.key === ride.status)

    return (
        <div className="flex flex-col gap-4">
            <div>
                <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>Seu pedido</h2>
                    {ride.scheduled_for && (
                        <span
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase"
                            style={{ background: `${colors.accent}15`, color: colors.accent }}
                        >
                            <CalendarClock size={11} />
                            Agendada: {formatScheduledFor(ride.scheduled_for)}
                        </span>
                    )}
                </div>
                <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                    {shortAddress(ride.origin_address)} → {shortAddress(ride.destination_address)}
                </p>
            </div>

            {/* Barra de progresso */}
            {ride.status === 'cancelled' ? (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: '#ef444415', color: '#ef4444' }}>
                    <XCircle size={16} />
                    <span className="text-sm font-bold">Pedido cancelado</span>
                </div>
            ) : (
                <div className="flex items-center">
                    {steps.map((s, i) => {
                        const Icon = s.icon
                        const active = i <= currentStepIndex
                        return (
                            <div key={s.key} className="flex items-center flex-1 last:flex-none">
                                <div className="flex flex-col items-center gap-1">
                                    <div
                                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                        style={active ? { background: GRADIENT, color: '#fff' } : { background: `${colors.border}30`, color: colors.textSecondary }}
                                    >
                                        <Icon size={14} />
                                    </div>
                                    <span className="text-[10px] font-bold text-center leading-tight w-16" style={{ color: active ? colors.textPrimary : colors.textSecondary }}>
                                        {s.label}
                                    </span>
                                </div>
                                {i < steps.length - 1 && (
                                    <div className="flex-1 h-0.5 mx-1 -mt-4" style={{ background: i < currentStepIndex ? GRADIENT : colors.border }} />
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Motorista aceito */}
            {ride.status === 'accepted' && driver && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                    {driver.avatarUrl ? (
                        <img src={driver.avatarUrl} className="w-11 h-11 rounded-full object-cover flex-shrink-0" alt="" />
                    ) : (
                        <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#fff' }}>
                            <Car size={18} />
                        </div>
                    )}
                    <div className="min-w-0">
                        <p className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>
                            {driver.name || (driver.profileSlug ? `@${driver.profileSlug}` : 'Motorista')}
                        </p>
                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>Confira a placa e a cor do carro antes de entrar.</p>
                    </div>
                </div>
            )}

            {/* Candidatos, enquanto pendente */}
            {ride.status === 'pending' && (
                <div>
                    <h3 className="text-xs font-black mb-2" style={{ color: colors.textPrimary }}>
                        {candidates.length === 0 ? 'Aguardando candidatos...' : `${candidates.length} motorista${candidates.length > 1 ? 's' : ''} se candidataram`}
                    </h3>
                    {candidates.length === 0 ? (
                        <div className="flex items-center gap-2 px-3 py-3 rounded-xl" style={{ background: `${colors.border}30` }}>
                            <Spinner size={14} color={colors.textSecondary} />
                            <span className="text-xs" style={{ color: colors.textSecondary }}>Assim que um motorista se candidatar, ele aparece aqui.</span>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {candidates.map((c) => (
                                <div key={c.applicationId} className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                                    {c.avatarUrl ? (
                                        <img src={c.avatarUrl} className="w-9 h-9 rounded-full object-cover flex-shrink-0" alt="" />
                                    ) : (
                                        <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT }}>
                                            <MapPin size={14} color="#fff" />
                                        </span>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <span className="text-xs font-bold block truncate" style={{ color: colors.textPrimary }}>
                                            {c.name || (c.profileSlug ? `@${c.profileSlug}` : 'Candidato')}
                                        </span>
                                        <span className="text-[11px] font-black" style={{ color: '#f97316' }}>
                                            {c.proposedPrice != null ? `Proposta: R$ ${c.proposedPrice.toFixed(2)}` : 'Sem valor definido'}
                                        </span>
                                    </div>

                                    {c.status === 'pending' ? (
                                        decidingId === c.applicationId ? (
                                            <Spinner size={14} color={colors.textSecondary} className="flex-shrink-0" />
                                        ) : (
                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                                <button
                                                    onClick={() => acceptCandidate(c.applicationId, c.applicantId)}
                                                    className="w-7 h-7 rounded-full flex items-center justify-center"
                                                    style={{ background: '#22c55e', color: '#fff' }}
                                                    title="Aceitar"
                                                >
                                                    <Check size={14} />
                                                </button>
                                                <button
                                                    onClick={() => rejectCandidate(c.applicationId)}
                                                    className="w-7 h-7 rounded-full flex items-center justify-center"
                                                    style={{ background: '#ef4444', color: '#fff' }}
                                                    title="Recusar"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        )
                                    ) : (
                                        <span className="text-[10px] font-black uppercase flex-shrink-0" style={{ color: c.status === 'accepted' ? '#22c55e' : colors.textSecondary }}>
                                            {c.status === 'accepted' ? 'Aceito' : 'Recusado'}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {ride.status === 'pending' && (
                <button
                    onClick={cancelRide}
                    disabled={cancelling}
                    className="w-full py-3 rounded-full font-bold text-xs disabled:opacity-50"
                    style={{ color: '#ef4444', border: `1px solid #ef444440` }}
                >
                    {cancelling ? <Spinner size={14} /> : 'Cancelar pedido'}
                </button>
            )}

            {(ride.status === 'completed' || ride.status === 'cancelled') && (
                <button
                    onClick={onExit}
                    className="w-full py-3 rounded-full font-black text-sm"
                    style={{ background: GRADIENT, color: '#fff' }}
                >
                    Fazer novo pedido
                </button>
            )}
        </div>
    )
}
