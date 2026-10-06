// src/components/ServiceRequestDetailsDialog.tsx
//
// Detalhes de um pedido de serviço do próprio usuário: o que foi pedido, onde,
// fotos, quem se candidatou (aceitar/recusar), edição do pedido e o componente
// "Visitantes dos serviços" (quem já viu o pedido).
'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, MapPin, Building2, Pencil, Eye, Check, Users, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { getServiceIcon } from '@/lib/serviceTypes'
import { Spinner } from '@/components/Spinner'
import ServiceRequestVisitors from '@/components/ServiceRequestVisitors'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export interface DialogCandidate {
    applicationId: string
    status: 'pending' | 'accepted' | 'rejected'
    name: string | null
    profileSlug: string | null
    avatarUrl: string | undefined
}

export interface DialogRequest {
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
    request: DialogRequest
    whenAsked: string
    decidingId: string | null
    onDecide: (applicationId: string, status: 'accepted' | 'rejected') => void
    onClose: () => void
    onSaved: (patch: { description: string; needsAccess: boolean; accessNotes: string | null }) => void
}

export default function ServiceRequestDetailsDialog({ request, whenAsked, decidingId, onDecide, onClose, onSaved }: Props) {
    const { colors } = useTheme()
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
            onSaved({ description: patch.description, needsAccess, accessNotes: patch.location_access_notes })
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
                            <p className="text-sm" style={{ color: colors.textSecondary }}>Ninguém se candidatou ainda. Assim que alguém aparecer, avisamos você.</p>
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
