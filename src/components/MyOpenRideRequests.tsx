// src/components/MyOpenRideRequests.tsx
'use client'

import { useEffect, useState } from 'react'
import { Check, X, MapPin } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { useTheme } from '@/app/theme'
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'
import { shortAddress } from '@/lib/serviceBoard'
import { toast } from 'sonner'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

function relativeTime(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime()
    const minutes = Math.floor(diffMs / 60000)
    if (minutes < 1) return 'agora'
    if (minutes < 60) return `${minutes} min atrás`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h atrás`
    const days = Math.floor(hours / 24)
    return `${days}d atrás`
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

interface OpenRide {
    id: string
    originAddress: string
    destinationAddress: string
    createdAt: string
    candidates: Candidate[]
}

interface MyOpenRideRequestsProps {
    limit?: number
    title?: string
}

export default function MyOpenRideRequests({ limit = 5, title }: MyOpenRideRequestsProps) {
    const { colors } = useTheme()
    const [loading, setLoading] = useState(true)
    const [rides, setRides] = useState<OpenRide[]>([])
    const [decidingId, setDecidingId] = useState<string | null>(null)

    const load = async () => {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            setRides([])
            setLoading(false)
            return
        }

        const { data: myRides } = await supabase
            .from('ride_requests')
            .select('id, origin_address, destination_address, created_at')
            .eq('requester_id', user.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(limit)

        if (!myRides || myRides.length === 0) {
            setRides([])
            setLoading(false)
            return
        }

        const rideIds = myRides.map((r) => r.id)
        const { data: applications } = await supabase
            .from('ride_applications')
            .select('id, ride_request_id, applicant_id, status, proposed_price')
            .in('ride_request_id', rideIds)

        const applicantIds = Array.from(new Set((applications || []).map((a) => a.applicant_id)))
        let profilesById = new Map<string, { name: string | null; profileSlug: string | null; avatar_url: string | null }>()
        if (applicantIds.length > 0) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, name, profileSlug, avatar_url')
                .in('id', applicantIds)
            profilesById = new Map((profiles || []).map((p) => [p.id, p]))
        }

        const result: OpenRide[] = myRides.map((r) => {
            const candidates: Candidate[] = (applications || [])
                .filter((a) => a.ride_request_id === r.id)
                .map((a) => {
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
            return {
                id: r.id,
                originAddress: r.origin_address,
                destinationAddress: r.destination_address,
                createdAt: r.created_at,
                candidates,
            }
        })

        setRides(result)
        setLoading(false)
    }

    useEffect(() => {
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Aceitar um candidato: primeiro trava a corrida (WHERE status='pending'),
    // só então marca a candidatura aceita e rejeita as demais. Se dois
    // candidatos forem aceitos quase ao mesmo tempo (duas abas, etc.), o
    // segundo UPDATE de ride_requests não afeta nenhuma linha e abortamos —
    // pior cenário é uma candidatura ficar "pending" sem decisão, nunca duas
    // corridas atribuídas ao mesmo pedido.
    const acceptCandidate = async (rideRequestId: string, applicationId: string, applicantId: string) => {
        setDecidingId(applicationId)
        try {
            const { data: updatedRide, error: rideError } = await supabase
                .from('ride_requests')
                .update({ status: 'accepted', driver_id: applicantId })
                .eq('id', rideRequestId)
                .eq('status', 'pending')
                .select('id')

            if (rideError) throw rideError
            if (!updatedRide || updatedRide.length === 0) {
                toast.error('Este pedido já foi decidido.')
                load()
                return
            }

            const { error: acceptError } = await supabase
                .from('ride_applications')
                .update({ status: 'accepted' })
                .eq('id', applicationId)
            if (acceptError) throw acceptError

            await supabase
                .from('ride_applications')
                .update({ status: 'rejected' })
                .eq('ride_request_id', rideRequestId)
                .eq('status', 'pending')
                .neq('id', applicationId)

            toast.success('Motorista escolhido!')
            setRides((prev) => prev.filter((r) => r.id !== rideRequestId))
        } catch (err: any) {
            toast.error('Erro ao decidir candidatura: ' + (err.message || 'tente novamente'))
        } finally {
            setDecidingId(null)
        }
    }

    const rejectCandidate = async (rideRequestId: string, applicationId: string) => {
        setDecidingId(applicationId)
        try {
            const { error } = await supabase.from('ride_applications').update({ status: 'rejected' }).eq('id', applicationId)
            if (error) throw error
            setRides((prev) =>
                prev.map((r) => ({
                    ...r,
                    candidates: r.candidates.map((c) => (c.applicationId === applicationId ? { ...c, status: 'rejected' } : c)),
                }))
            )
            toast.success('Candidato recusado.')
        } catch (err: any) {
            toast.error('Erro ao recusar candidatura: ' + (err.message || 'tente novamente'))
        } finally {
            setDecidingId(null)
        }
    }

    if (loading || rides.length === 0) return null

    return (
        <div>
            {title && (
                <h3 className="text-sm font-black mb-2" style={{ color: colors.textPrimary }}>{title}</h3>
            )}
            <div className="flex gap-3 overflow-x-auto pb-1">
                {rides.map((r) => (
                    <div
                        key={r.id}
                        className="flex-shrink-0 w-64 rounded-xl p-3 flex flex-col gap-2"
                        style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                    >
                        <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#fff' }}>
                                <MapPin size={16} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-black truncate" style={{ color: colors.textPrimary }}>
                                    {shortAddress(r.originAddress)} → {shortAddress(r.destinationAddress)}
                                </p>
                                <p className="text-[10px]" style={{ color: colors.textSecondary }}>{relativeTime(r.createdAt)}</p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5 mt-1">
                            {r.candidates.length === 0 ? (
                                <span className="text-[11px]" style={{ color: colors.textSecondary }}>Nenhum motorista ainda</span>
                            ) : (
                                r.candidates.map((c) => (
                                    <div
                                        key={c.applicationId}
                                        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5"
                                        style={{ background: `${colors.border}30` }}
                                    >
                                        {c.avatarUrl ? (
                                            <img src={c.avatarUrl} className="w-5 h-5 rounded-full object-cover flex-shrink-0" alt="" />
                                        ) : (
                                            <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT }}>
                                                <MapPin size={10} color="#fff" />
                                            </span>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <span className="text-[10px] font-bold block truncate" style={{ color: colors.textPrimary }}>
                                                {c.name || (c.profileSlug ? `@${c.profileSlug}` : 'Candidato')}
                                            </span>
                                            <span className="text-[9px] font-black" style={{ color: '#f97316' }}>
                                                {c.proposedPrice != null ? `R$ ${c.proposedPrice.toFixed(2)}` : 'Sem valor definido'}
                                            </span>
                                        </div>

                                        {c.status === 'pending' ? (
                                            decidingId === c.applicationId ? (
                                                <Spinner size={12} color={colors.textSecondary} className="flex-shrink-0" />
                                            ) : (
                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                    <button
                                                        onClick={() => acceptCandidate(r.id, c.applicationId, c.applicantId)}
                                                        className="w-5 h-5 rounded-full flex items-center justify-center"
                                                        style={{ background: '#22c55e', color: '#fff' }}
                                                        title="Aceitar"
                                                    >
                                                        <Check size={11} />
                                                    </button>
                                                    <button
                                                        onClick={() => rejectCandidate(r.id, c.applicationId)}
                                                        className="w-5 h-5 rounded-full flex items-center justify-center"
                                                        style={{ background: '#ef4444', color: '#fff' }}
                                                        title="Recusar"
                                                    >
                                                        <X size={11} />
                                                    </button>
                                                </div>
                                            )
                                        ) : (
                                            <span
                                                className="text-[9px] font-black uppercase flex-shrink-0"
                                                style={{ color: c.status === 'accepted' ? '#22c55e' : colors.textSecondary }}
                                            >
                                                {c.status === 'accepted' ? 'Aceito' : 'Recusado'}
                                            </span>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
