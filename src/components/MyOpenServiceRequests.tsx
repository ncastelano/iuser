// src/components/MyOpenServiceRequests.tsx
//
// "Seus pedidos em aberto": os pedidos de serviço que a própria pessoa fez,
// em cards com a foto do que ela pediu. Clicar abre o diálogo com os detalhes,
// edição, candidatos e quem viu o pedido.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { MapPin, Eye, Users, Clock, CheckCircle2 } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'
import { getServiceIcon, getServiceLabel } from '@/lib/serviceTypes'
import { askedAgo, SERVICE_REQUESTS_CHANGED } from '@/lib/serviceBoard'
import { HomeSubheading } from '@/app/(main)/inicio/sections/HomeSubheading'
import ServiceRequestDetailsDialog from '@/components/ServiceRequestDetailsDialog'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

function shortAddress(address: string): string {
    const firstPart = address.split(',')[0].trim()
    return firstPart.length > 30 ? firstPart.substring(0, 28) + '...' : firstPart
}

interface Candidate {
    id: string
    status: 'pending' | 'accepted' | 'rejected'
    name: string | null
    avatarUrl: string | undefined
}

interface OpenRequest {
    id: string
    serviceType: string
    serviceLabel: string
    locationAddress: string
    createdAt: string
    viewCount: number
    photoUrl: string | null
    candidates: Candidate[]
}

interface MyOpenServiceRequestsProps {
    limit?: number
    title?: string
}

export default function MyOpenServiceRequests({ limit = 5, title }: MyOpenServiceRequestsProps) {
    const { colors } = useTheme()
    const { userId, loading: profileLoading } = useProfile()
    const [loading, setLoading] = useState(true)
    const [requests, setRequests] = useState<OpenRequest[]>([])
    const [openId, setOpenId] = useState<string | null>(null)

    const load = useCallback(async () => {
        if (!userId) {
            setRequests([])
            setLoading(false)
            return
        }

        const { data: myRequests } = await supabase
            .from('service_requests')
            .select('id, service_type, custom_service, location_address, created_at, view_count, photo_urls')
            .eq('requester_id', userId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(limit)

        if (!myRequests || myRequests.length === 0) {
            setRequests([])
            setLoading(false)
            return
        }

        const { data: applications } = await supabase
            .from('service_applications')
            .select('id, service_request_id, applicant_id, status')
            .in('service_request_id', myRequests.map((r) => r.id))

        const applicantIds = Array.from(new Set((applications || []).map((a) => a.applicant_id)))
        let profilesById = new Map<string, { name: string | null; avatar_url: string | null }>()
        if (applicantIds.length > 0) {
            const { data: profiles } = await supabase.from('profiles').select('id, name, avatar_url').in('id', applicantIds)
            profilesById = new Map((profiles || []).map((p) => [p.id, p]))
        }

        setRequests(myRequests.map((r) => ({
            id: r.id,
            serviceType: r.service_type,
            serviceLabel: getServiceLabel(r.service_type, r.custom_service),
            locationAddress: r.location_address,
            createdAt: r.created_at,
            viewCount: r.view_count || 0,
            photoUrl: r.photo_urls?.[0] || null,
            candidates: (applications || [])
                .filter((a) => a.service_request_id === r.id)
                .map((a) => {
                    const p = profilesById.get(a.applicant_id)
                    return { id: a.id, status: a.status, name: p?.name || null, avatarUrl: getAvatarUrl(supabase, p?.avatar_url) }
                }),
        })))
        setLoading(false)
    }, [userId, limit])

    useEffect(() => {
        if (profileLoading) return
        load()
        window.addEventListener(SERVICE_REQUESTS_CHANGED, load)
        return () => window.removeEventListener(SERVICE_REQUESTS_CHANGED, load)
    }, [profileLoading, load])

    if (loading || requests.length === 0) return null

    return (
        <div>
            {title && (
                <HomeSubheading title={title} subtitle="Toque num pedido para ver os detalhes, editar ou escolher quem vai fazer" />
            )}
            <div className="flex gap-3 overflow-x-auto pb-1">
                {requests.map((r) => {
                    const Icon = getServiceIcon(r.serviceType)
                    const hired = r.candidates.find((c) => c.status === 'accepted')
                    const waiting = r.candidates.filter((c) => c.status === 'pending')
                    return (
                        <div
                            key={r.id}
                            onClick={() => setOpenId(r.id)}
                            className="flex-shrink-0 w-64 rounded-3xl overflow-hidden flex flex-col cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.99]"
                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                        >
                            {/* Capa: foto do que a pessoa pediu (ícone só quando não tem foto) */}
                            <div className="relative h-32 w-full" style={{ background: r.photoUrl ? colors.border : GRADIENT }}>
                                {r.photoUrl ? (
                                    <img src={r.photoUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <Icon size={44} color="rgba(255,255,255,0.85)" />
                                    </div>
                                )}
                                <div className="absolute inset-x-0 bottom-0 h-16 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.65), transparent)' }} />
                                <span className="absolute left-3 bottom-2.5 text-sm font-black text-white drop-shadow">{r.serviceLabel}</span>
                                <span className="absolute right-2.5 top-2.5 flex items-center gap-1 text-[10px] font-bold text-white px-2 py-1 rounded-full" style={{ background: 'rgba(0,0,0,0.45)' }}>
                                    <Eye size={11} />
                                    {r.viewCount}
                                </span>
                            </div>

                            <div className="p-3.5 flex flex-col gap-2">
                                <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: colors.textSecondary }}>
                                    <span className="flex items-center gap-1 min-w-0">
                                        <MapPin size={11} className="flex-shrink-0" />
                                        <span className="truncate">{shortAddress(r.locationAddress)}</span>
                                    </span>
                                    <span className="flex items-center gap-1 flex-shrink-0">
                                        <Clock size={11} />
                                        {askedAgo(r.createdAt).replace('pediu ', '')}
                                    </span>
                                </div>

                                {/* Como está o pedido, em palavras */}
                                {hired ? (
                                    <div className="flex items-center gap-2 rounded-xl px-2.5 py-2" style={{ background: '#22c55e18' }}>
                                        <CheckCircle2 size={15} color="#22c55e" className="flex-shrink-0" />
                                        <span className="text-xs font-bold truncate" style={{ color: '#16a34a' }}>
                                            {hired.name ? `${hired.name.split(' ')[0]} vai fazer` : 'Profissional contratado'}
                                        </span>
                                    </div>
                                ) : waiting.length > 0 ? (
                                    <div className="flex items-center gap-2 rounded-xl px-2.5 py-2" style={{ background: `${colors.accent}15` }}>
                                        <div className="flex -space-x-2 flex-shrink-0">
                                            {waiting.slice(0, 3).map((c) => (
                                                c.avatarUrl ? (
                                                    <img key={c.id} src={c.avatarUrl} className="w-6 h-6 rounded-full object-cover" style={{ border: `2px solid ${colors.surface}` }} alt="" />
                                                ) : (
                                                    <span key={c.id} className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: GRADIENT, border: `2px solid ${colors.surface}` }}>
                                                        <Users size={11} color="#fff" />
                                                    </span>
                                                )
                                            ))}
                                        </div>
                                        <span className="text-xs font-bold leading-tight" style={{ color: colors.accent }}>
                                            {waiting.length} {waiting.length === 1 ? 'profissional quer' : 'profissionais querem'} fazer. Escolha!
                                        </span>
                                    </div>
                                ) : (
                                    <div className="rounded-xl px-2.5 py-2 text-xs leading-snug" style={{ background: `${colors.border}30`, color: colors.textSecondary }}>
                                        Esperando os profissionais verem seu pedido. Avisamos quando alguém quiser fazer.
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {openId && <ServiceRequestDetailsDialog requestId={openId} onClose={() => { setOpenId(null); load() }} />}
        </div>
    )
}
