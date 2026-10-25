// src/components/appointments/AppointmentReviewPanel.tsx
//
// "Serviço feito" e avaliações de UM serviço agendado, para os dois lados (detalhe do compromisso):
//  - DONO: depois de confirmar, marca "Serviço feito"; então avalia o cliente e vê o que o cliente disse do serviço.
//  - CLIENTE: com o serviço feito, avalia o serviço (a avaliação vai para as avaliações do serviço). Só vê a avaliação que ele mesmo fez.
// A privacidade é do banco (migration 20261124); aqui só se mostra o que ele devolve.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Send } from 'lucide-react'
import { completeAppointment, getReviewState, submitReview, type ReviewState } from '@/lib/appointmentReviews'
import Stars from './Stars'

export interface ReviewPalette { textPrimary: string; textSecondary: string; surface: string; border: string; accent: string }

export default function AppointmentReviewPanel({ appointmentId, palette, onChanged }: { appointmentId: string; palette: ReviewPalette; onChanged?: () => void }) {
    const [st, setSt] = useState<ReviewState | null | undefined>(undefined)
    const [busy, setBusy] = useState(false)
    const [rating, setRating] = useState(0)
    const [comment, setComment] = useState('')
    const c = palette

    const load = useCallback(() => { getReviewState(appointmentId).then(setSt, () => setSt(null)) }, [appointmentId])
    useEffect(() => { load() }, [load])

    if (!st) return null
    const isOwner = st.role === 'owner'
    const box = { background: c.surface, border: `1px solid ${c.border}55`, borderRadius: 16, padding: 14 } as const

    const done = async () => {
        if (!confirm('Marcar este serviço como feito? O cliente poderá avaliá-lo.')) return
        setBusy(true)
        try { await completeAppointment(appointmentId); toast.success('Serviço marcado como feito'); load(); onChanged?.() }
        catch (e: any) { toast.error(e.message || 'Não foi possível finalizar') }
        finally { setBusy(false) }
    }
    const send = async () => {
        if (rating < 1) { toast.error('Escolha de 1 a 5 estrelas'); return }
        setBusy(true)
        try { await submitReview(appointmentId, rating, comment); toast.success('Avaliação enviada'); setRating(0); setComment(''); load(); onChanged?.() }
        catch (e: any) { toast.error(e.message || 'Não foi possível avaliar') }
        finally { setBusy(false) }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {st.can_complete && (
                <div style={box}>
                    <p style={{ color: c.textPrimary, fontWeight: 800, fontSize: 14 }}>O serviço já foi feito?</p>
                    <p style={{ color: c.textSecondary, fontSize: 12, margin: '4px 0 10px' }}>Ao finalizar, o cliente é convidado a avaliar o serviço e você avalia o cliente.</p>
                    <button onClick={done} disabled={busy} style={{ width: '100%', border: 'none', borderRadius: 12, padding: '11px 14px', background: '#10b981', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy ? 0.6 : 1 }}>
                        <CheckCircle2 size={16} /> Serviço feito
                    </button>
                </div>
            )}

            {st.status === 'completed' && (
                <div style={box}>
                    <p style={{ color: '#10b981', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={15} /> Serviço finalizado</p>

                    {st.my_review ? (
                        <div style={{ marginTop: 10 }}>
                            <p style={{ color: c.textSecondary, fontSize: 12, marginBottom: 4 }}>{isOwner ? 'Sua avaliação do cliente' : 'Sua avaliação do serviço'}</p>
                            <Stars value={st.my_review.rating} />
                            {st.my_review.comment && <p style={{ color: c.textPrimary, fontSize: 13, marginTop: 4 }}>“{st.my_review.comment}”</p>}
                        </div>
                    ) : st.can_review ? (
                        <div style={{ marginTop: 10 }}>
                            <p style={{ color: c.textPrimary, fontWeight: 800, fontSize: 14, marginBottom: 6 }}>{isOwner ? 'Avalie o cliente' : 'Avalie o serviço'}</p>
                            <Stars value={rating} onChange={setRating} size={26} />
                            <textarea
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                maxLength={500}
                                rows={3}
                                placeholder={isOwner ? 'Como foi atender essa pessoa? (só você e outros donos de serviço veem)' : 'Conte como foi o serviço (aparece nas avaliações do serviço)'}
                                style={{ width: '100%', marginTop: 8, borderRadius: 12, border: `1px solid ${c.border}66`, background: 'transparent', color: c.textPrimary, padding: 10, fontSize: 13, resize: 'none', outline: 'none' }}
                            />
                            <button onClick={send} disabled={busy || rating < 1} style={{ marginTop: 8, width: '100%', border: 'none', borderRadius: 12, padding: '11px 14px', background: c.accent, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy || rating < 1 ? 0.55 : 1 }}>
                                <Send size={15} /> Enviar avaliação
                            </button>
                            {!isOwner && <p style={{ color: c.textSecondary, fontSize: 11, marginTop: 6 }}>O dono do serviço também avalia você, mas essa avaliação não aparece para você.</p>}
                        </div>
                    ) : null}

                    {isOwner && st.client_review && (
                        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${c.border}40` }}>
                            <p style={{ color: c.textSecondary, fontSize: 12, marginBottom: 4 }}>O cliente avaliou o serviço</p>
                            <Stars value={st.client_review.rating} />
                            {st.client_review.comment && <p style={{ color: c.textPrimary, fontSize: 13, marginTop: 4 }}>“{st.client_review.comment}”</p>}
                        </div>
                    )}
                    {isOwner && !st.client_review && st.my_review && <p style={{ color: c.textSecondary, fontSize: 12, marginTop: 10 }}>O cliente ainda não avaliou o serviço.</p>}
                </div>
            )}
        </div>
    )
}
