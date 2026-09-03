// src/components/MyOpenServiceRequests.tsx
'use client'

import { useEffect, useState } from 'react'
import { Check, X, Loader2, MapPin, Users } from 'lucide-react'
import { useTheme } from '@/app/theme'
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'
import { getServiceIcon, getServiceLabel } from '@/lib/serviceTypes'
import { toast } from 'sonner'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

function shortAddress(address: string): string {
    const firstPart = address.split(',')[0].trim()
    return firstPart.length > 28 ? firstPart.substring(0, 26) + '...' : firstPart
}

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
    name: string | null
    profileSlug: string | null
    avatarUrl: string | undefined
}

interface OpenRequest {
    id: string
    serviceType: string
    serviceLabel: string
    locationAddress: string
    createdAt: string
    candidates: Candidate[]
}

interface MyOpenServiceRequestsProps {
    limit?: number
    title?: string
}

export default function MyOpenServiceRequests({ limit = 5, title }: MyOpenServiceRequestsProps) {
    const { colors } = useTheme()
    const [loading, setLoading] = useState(true)
    const [requests, setRequests] = useState<OpenRequest[]>([])
    const [decidingId, setDecidingId] = useState<string | null>(null)

    const load = async () => {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            setRequests([])
            setLoading(false)
            return
        }

        const { data: myRequests } = await supabase
            .from('service_requests')
            .select('id, service_type, custom_service, location_address, created_at')
            .eq('requester_id', user.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(limit)

        if (!myRequests || myRequests.length === 0) {
            setRequests([])
            setLoading(false)
            return
        }

        const requestIds = myRequests.map((r) => r.id)
        const { data: applications } = await supabase
            .from('service_applications')
            .select('id, service_request_id, applicant_id, status')
            .in('service_request_id', requestIds)

        const applicantIds = Array.from(new Set((applications || []).map((a) => a.applicant_id)))
        let profilesById = new Map<string, { name: string | null; profileSlug: string | null; avatar_url: string | null }>()
        if (applicantIds.length > 0) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, name, profileSlug, avatar_url')
                .in('id', applicantIds)
            profilesById = new Map((profiles || []).map((p) => [p.id, p]))
        }

        const result: OpenRequest[] = myRequests.map((r) => {
            const serviceLabel = getServiceLabel(r.service_type, r.custom_service)
            const candidates: Candidate[] = (applications || [])
                .filter((a) => a.service_request_id === r.id)
                .map((a) => {
                    const p = profilesById.get(a.applicant_id)
                    return {
                        applicationId: a.id,
                        applicantId: a.applicant_id,
                        status: a.status,
                        name: p?.name || null,
                        profileSlug: p?.profileSlug || null,
                        avatarUrl: getAvatarUrl(supabase, p?.avatar_url),
                    }
                })
            return {
                id: r.id,
                serviceType: r.service_type,
                serviceLabel,
                locationAddress: r.location_address,
                createdAt: r.created_at,
                candidates,
            }
        })

        setRequests(result)
        setLoading(false)
    }

    useEffect(() => {
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const decide = async (applicationId: string, status: 'accepted' | 'rejected') => {
        setDecidingId(applicationId)
        try {
            const { error } = await supabase.from('service_applications').update({ status }).eq('id', applicationId)
            if (error) throw error
            setRequests((prev) =>
                prev.map((r) => ({
                    ...r,
                    candidates: r.candidates.map((c) => (c.applicationId === applicationId ? { ...c, status } : c)),
                }))
            )
            toast.success(status === 'accepted' ? 'Candidato aceito!' : 'Candidato recusado.')
        } catch (err: any) {
            toast.error('Erro ao atualizar candidatura: ' + (err.message || 'tente novamente'))
        } finally {
            setDecidingId(null)
        }
    }

    if (loading || requests.length === 0) return null

    return (
        <div>
            {title && (
                <h3 className="text-sm font-black mb-2" style={{ color: colors.textPrimary }}>{title}</h3>
            )}
            <div className="flex gap-3 overflow-x-auto pb-1">
                {requests.map((r) => {
                    const Icon = getServiceIcon(r.serviceType)
                    return (
                        <div
                            key={r.id}
                            className="flex-shrink-0 w-60 rounded-xl p-3 flex flex-col gap-2"
                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                        >
                            <div className="flex items-center gap-2">
                                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#fff' }}>
                                    <Icon size={16} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-black truncate" style={{ color: colors.textPrimary }}>{r.serviceLabel}</p>
                                    <p className="text-[10px] flex items-center gap-1 truncate" style={{ color: colors.textSecondary }}>
                                        <MapPin size={9} className="flex-shrink-0" />
                                        {shortAddress(r.locationAddress)}
                                    </p>
                                </div>
                            </div>

                            <span className="text-[10px]" style={{ color: colors.textSecondary }}>{relativeTime(r.createdAt)}</span>

                            <div className="flex flex-col gap-1.5 mt-1">
                                {r.candidates.length === 0 ? (
                                    <span className="text-[11px]" style={{ color: colors.textSecondary }}>Nenhum candidato ainda</span>
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
                                                    <Users size={10} color="#fff" />
                                                </span>
                                            )}
                                            <span className="text-[10px] font-bold flex-1 truncate" style={{ color: colors.textPrimary }}>
                                                {c.name || (c.profileSlug ? `@${c.profileSlug}` : 'Candidato')}
                                            </span>

                                            {c.status === 'pending' ? (
                                                decidingId === c.applicationId ? (
                                                    <Loader2 size={12} className="animate-spin flex-shrink-0" style={{ color: colors.textSecondary }} />
                                                ) : (
                                                    <div className="flex items-center gap-1 flex-shrink-0">
                                                        <button
                                                            onClick={() => decide(c.applicationId, 'accepted')}
                                                            className="w-5 h-5 rounded-full flex items-center justify-center"
                                                            style={{ background: '#22c55e', color: '#fff' }}
                                                            title="Aceitar"
                                                        >
                                                            <Check size={11} />
                                                        </button>
                                                        <button
                                                            onClick={() => decide(c.applicationId, 'rejected')}
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
                    )
                })}
            </div>
        </div>
    )
}
