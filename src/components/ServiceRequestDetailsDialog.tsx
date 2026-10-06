// src/components/ServiceRequestDetailsDialog.tsx
//
// Detalhes de um pedido de serviço do próprio usuário: o que foi pedido, onde,
// fotos, quem se inscreveu (aceitar/recusar), edição do pedido e o componente
// "Visitantes dos serviços" (quem já viu o pedido).
'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, MapPin, Building2, Pencil, Eye, Check, Users, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { getServiceIcon, getServiceLabel } from '@/lib/serviceTypes'
import { getAvatarUrl } from '@/lib/avatar'
import { askedAgo, notifyServiceRequestsChanged } from '@/lib/serviceBoard'
import { Spinner } from '@/components/Spinner'
import ServiceRequestVisitors from '@/components/ServiceRequestVisitors'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface DialogCandidate {
    applicationId: string
    status: 'pending' | 'accepted' | 'rejected'
    name: string | null
    profileSlug: string | null
    avatarUrl: string | undefined
}

interface DialogRequest {
    id: string
    serviceType: string
    serviceLabel: string
    locationAddress: string
    description: string
    photoUrls: string[]
    needsAccess: boolean
    accessNotes: string | null
    createdAt: string
    viewCount: number
    candidates: DialogCandidate[]
}

interface Props {
    requestId: string
    onClose: () => void
}

// Carrega o pedido sozinho pelo id, pra poder abrir de qualquer lista (Seus
// pedidos em aberto, "more" do Quem procura serviço).
export default function ServiceRequestDetailsDialog({ requestId, onClose }: Props) {
    const { colors } = useTheme()
    const [request, setRequest] = useState<DialogRequest | null>(null)
    const [decidingId, setDecidingId] = useState<string | null>(null)

    const load = async () => {
        const { data: r } = await supabase
            .from('service_requests')
            .select('id, service_type, custom_service, location_address, description, photo_urls, location_needs_access, location_access_notes, created_at, view_count')
            .eq('id', requestId)
            .maybeSingle()
        if (!r) { onClose(); return }

        const { data: apps } = await supabase
            .from('service_applications')
            .select('id, applicant_id, status')
            .eq('service_request_id', requestId)
        const ids = Array.from(new Set((apps || []).map((a) => a.applicant_id)))
        const { data: profiles } = ids.length
            ? await supabase.from('profiles').select('id, name, profileSlug, avatar_url').in('id', ids)
            : { data: [] as any[] }
        const byId = new Map((profiles || []).map((p: any) => [p.id, p]))

        setRequest({
            id: r.id,
            serviceType: r.service_type,
            serviceLabel: getServiceLabel(r.service_type, r.custom_service),
            locationAddress: r.location_address,
            description: r.description || '',
            photoUrls: r.photo_urls || [],
            needsAccess: !!r.location_needs_access,
            accessNotes: r.location_access_notes || null,
            createdAt: r.created_at,
            viewCount: r.view_count || 0,
            candidates: (apps || []).map((a) => {
                const p: any = byId.get(a.applicant_id)
                return {
                    applicationId: a.id,
                    status: a.status,
                    name: p?.name || null,
                    profileSlug: p?.profileSlug || null,
                    avatarUrl: getAvatarUrl(supabase, p?.avatar_url),
                }
            }),
        })
    }

    useEffect(() => {
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestId])

    const decide = async (applicationId: string, status: 'accepted' | 'rejected') => {
        setDecidingId(applicationId)
        try {
            const { error } = await supabase.from('service_applications').update({ status }).eq('id', applicationId)
            if (error) throw error
            setRequest((prev) => prev && ({
                ...prev,
                candidates: prev.candidates.map((c) => (c.applicationId === applicationId ? { ...c, status } : c)),
            }))
            toast.success(status === 'accepted' ? 'Inscrito aceito!' : 'Inscrito recusado.')
            notifyServiceRequestsChanged()
        } catch (err: any) {
            toast.error('Erro ao atualizar inscrição: ' + (err.message || 'tente novamente'))
        } finally {
            setDecidingId(null)
        }
    }

    if (!request) {
        return createPortal(
            <div className="fixed inset-0 z-[1000] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
                <Spinner size={28} color="#fff" />
            </div>,
            document.body
        )
    }

    return <DetailsBody request={request} setRequest={setRequest} decidingId={decidingId} onDecide={decide} onClose={onClose} colors={colors} />
}

function DetailsBody({ request, setRequest, decidingId, onDecide, onClose, colors }: {
    request: DialogRequest
    setRequest: React.Dispatch<React.SetStateAction<DialogRequest | null>>
    decidingId: string | null
    onDecide: (applicationId: string, status: 'accepted' | 'rejected') => void
    onClose: () => void
    colors: any
}) {
    const whenAsked = `você ${askedAgo(request.createdAt)}`
    const Icon = getServiceIcon(request.serviceType)

    const [editing, setEditing] = useState(false)
    const [description, setDescription] = useState(request.description)
    const [needsAccess, setNeedsAccess] = useState(request.needsAccess)
    const [accessNotes, setAccessNotes] = useState(request.accessNotes || '')
    const [saving, setSaving] = useState(false)

    const save = async () => {
        if (!description.trim()) {
            toast.error('Descreva o que você precisa')
            return
        }
        setSaving(true)
        try {
            const patch = {
                description: description.trim(),
                location_needs_access: needsAccess,
                location_access_notes: needsAccess ? (accessNotes.trim() || null) : null,
            }
            // .select() pra perceber quando o RLS bloqueia (0 linhas, sem erro).
            const { data, error } = await supabase.from('service_requests').update(patch).eq('id', request.id).select('id')
            if (error) throw error
            if (!data || data.length === 0) {
                toast.error('Não foi possível salvar: sem permissão para editar esse pedido.')
                return
            }
            toast.success('Pedido atualizado')
            setRequest((prev) => prev && ({ ...prev, description: patch.description, needsAccess, accessNotes: patch.location_access_notes }))
            notifyServiceRequestsChanged()
            setEditing(false)
        } catch (err: any) {
            toast.error('Erro ao salvar: ' + (err.message || 'tente novamente'))
        } finally {
            setSaving(false)
        }
    }

    const section = (children: React.ReactNode) => (
        <div className="rounded-2xl p-4" style={{ background: `${colors.border}15`, border: `1px solid ${colors.border}` }}>{children}</div>
    )
    const label = (text: string) => (
        <h4 className="text-[11px] font-black uppercase tracking-widest mb-2" style={{ color: colors.textSecondary }}>{text}</h4>
    )

    return createPortal(
        <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center sm:p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
            <div
                className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 flex flex-col gap-4"
                style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Cabeçalho */}
                <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#fff' }}>
                        <Icon size={22} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-black leading-tight" style={{ color: colors.textPrimary }}>Pedido de {request.serviceLabel.toLowerCase()}</h3>
                        <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: colors.textSecondary }}>
                            <Clock size={11} /> {whenAsked}
                            <span className="mx-1">·</span>
                            <Eye size={11} />
                            {request.viewCount === 0 ? 'ninguém viu ainda' : `${request.viewCount} ${request.viewCount === 1 ? 'pessoa viu' : 'pessoas viram'}`}
                        </p>
                    </div>
                    <button onClick={onClose} aria-label="Fechar" className="flex-shrink-0" style={{ color: colors.textSecondary }}>
                        <X size={20} />
                    </button>
                </div>

                {/* O que foi pedido */}
                {section(
                    <>
                        <div className="flex items-center justify-between">
                            {label('O que você pediu')}
                            {!editing && (
                                <button
                                    onClick={() => setEditing(true)}
                                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase -mt-2"
                                    style={{ background: `${colors.accent}15`, color: colors.accent }}
                                >
                                    <Pencil size={12} />
                                    Editar
                                </button>
                            )}
                        </div>

                        {editing ? (
                            <>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={4}
                                    className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none resize-none"
                                    style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                />
                                <div className="flex items-center justify-between gap-2 mt-3">
                                    <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: colors.textPrimary }}>
                                        <Building2 size={13} style={{ color: '#ef4444' }} />
                                        É um condomínio fechado?
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                        {[true, false].map((v) => (
                                            <button
                                                key={String(v)}
                                                onClick={() => setNeedsAccess(v)}
                                                className="px-3 py-1 rounded-full text-[11px] font-black"
                                                style={needsAccess === v ? { background: GRADIENT, color: '#fff' } : { background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                            >
                                                {v ? 'SIM' : 'NÃO'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {needsAccess && (
                                    <input
                                        type="text"
                                        value={accessNotes}
                                        onChange={(e) => setAccessNotes(e.target.value)}
                                        placeholder="Número da rua, apartamento ou quadra..."
                                        className="w-full mt-2 px-3 py-2 rounded-lg text-sm focus:outline-none"
                                        style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                    />
                                )}
                                <div className="flex gap-2 mt-4">
                                    <button
                                        onClick={() => {
                                            setEditing(false)
                                            setDescription(request.description)
                                            setNeedsAccess(request.needsAccess)
                                            setAccessNotes(request.accessNotes || '')
                                        }}
                                        className="px-5 py-2.5 rounded-xl font-black uppercase text-xs tracking-wider"
                                        style={{ background: `${colors.border}30`, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={save}
                                        disabled={saving}
                                        className="flex-1 py-2.5 rounded-xl font-black uppercase text-xs tracking-wider disabled:opacity-60 flex items-center justify-center gap-2"
                                        style={{ background: GRADIENT, color: '#fff' }}
                                    >
                                        {saving && <Spinner size={14} />}
                                        Salvar
                                    </button>
                                </div>
                            </>
                        ) : (
                            <p className="text-sm whitespace-pre-line" style={{ color: colors.textPrimary }}>{request.description || 'Sem descrição.'}</p>
                        )}
                    </>
                )}

                {/* Onde */}
                {section(
                    <>
                        {label('Onde é o serviço')}
                        <p className="text-sm flex items-start gap-2" style={{ color: colors.textPrimary }}>
                            <MapPin size={15} className="flex-shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
                            {request.locationAddress}
                        </p>
                        {request.needsAccess && (
                            <p className="text-xs flex items-start gap-2 mt-2" style={{ color: colors.textSecondary }}>
                                <Building2 size={13} className="flex-shrink-0 mt-0.5" />
                                Condomínio fechado{request.accessNotes ? ` — ${request.accessNotes}` : ''}
                            </p>
                        )}
                    </>
                )}

                {/* Fotos */}
                {request.photoUrls.length > 0 && section(
                    <>
                        {label(`Fotos (${request.photoUrls.length})`)}
                        <div className="flex gap-2 overflow-x-auto pb-1">
                            {request.photoUrls.map((url) => (
                                <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                                    <img src={url} alt="" className="w-24 h-24 rounded-xl object-cover" style={{ border: `1px solid ${colors.border}` }} />
                                </a>
                            ))}
                        </div>
                    </>
                )}

                {/* Candidatos */}
                {section(
                    <>
                        {label(`Quem quer fazer (${request.candidates.length})`)}
                        {request.candidates.length === 0 ? (
                            <p className="text-sm" style={{ color: colors.textSecondary }}>Ninguém se inscreveu ainda. Assim que alguém aparecer, avisamos você.</p>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {request.candidates.map((c) => (
                                    <div key={c.applicationId} className="flex items-center gap-2.5 rounded-xl px-3 py-2" style={{ background: `${colors.border}30` }}>
                                        {c.avatarUrl ? (
                                            <img src={c.avatarUrl} className="w-8 h-8 rounded-full object-cover flex-shrink-0" alt="" />
                                        ) : (
                                            <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT }}>
                                                <Users size={14} color="#fff" />
                                            </span>
                                        )}
                                        <span className="text-sm font-bold flex-1 truncate" style={{ color: colors.textPrimary }}>
                                            {c.name || (c.profileSlug ? `@${c.profileSlug}` : 'Profissional')}
                                        </span>
                                        {c.status === 'pending' ? (
                                            decidingId === c.applicationId ? (
                                                <Spinner size={14} color={colors.textSecondary} />
                                            ) : (
                                                <div className="flex items-center gap-1.5">
                                                    <button onClick={() => onDecide(c.applicationId, 'accepted')} className="h-7 px-2.5 rounded-full flex items-center gap-1 text-[11px] font-black" style={{ background: '#22c55e', color: '#fff' }}>
                                                        <Check size={12} /> Aceitar
                                                    </button>
                                                    <button onClick={() => onDecide(c.applicationId, 'rejected')} className="h-7 px-2.5 rounded-full flex items-center gap-1 text-[11px] font-black" style={{ background: '#ef4444', color: '#fff' }}>
                                                        <X size={12} /> Recusar
                                                    </button>
                                                </div>
                                            )
                                        ) : (
                                            <span className="text-[10px] font-black uppercase" style={{ color: c.status === 'accepted' ? '#22c55e' : colors.textSecondary }}>
                                                {c.status === 'accepted' ? 'Contratado' : 'Recusado'}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* Quem viu o pedido */}
                <ServiceRequestVisitors requestId={request.id} />
            </div>
        </div>,
        document.body
    )
}
