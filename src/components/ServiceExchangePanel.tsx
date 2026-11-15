// src/components/ServiceExchangePanel.tsx
//
// Tudo o que acontece DEPOIS que alguém foi escolhido pra um pedido de serviço, pros dois lados:
//   • falar com a outra pessoa (WhatsApp e chat do iUser — o chat abre mesmo que a pessoa não tenha ligado conversas)
//   • quem pediu marca "Serviço feito" (o escolhido recebe aviso)
//   • depois de feito, os dois se avaliam (1 a 5 estrelas + comentário) e cada um vê a avaliação do outro.
//     Cada lado avalia uma coisa: quem pediu avalia o SERVIÇO feito; o profissional avalia o CONTRATANTE (educação,
//     pagamento, negociação...) — isso aparece pros próximos profissionais que ele for contratar.
//     O profissional também pode registrar que RECEBEU uma gorjeta e se ela pode ser mostrada. Gorjeta é um agrado,
//     nunca uma obrigação: não marcar nada não muda nada pra ninguém (e ninguém vê "não deu").
'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Gift, MessageCircle, Star } from 'lucide-react'
import { toast } from '@/lib/toast'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import ChatContactButton from '@/components/ChatContactButton'
import { getWhatsAppLink } from '@/lib/whatsapp'
import { notifyServiceDecision } from '@/lib/notifyRideStatus'
import { notifyServiceRequestsChanged } from '@/lib/serviceBoard'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface Props {
    applicationId: string
    /** 'owner' = quem pediu o serviço; 'provider' = quem foi escolhido */
    role: 'owner' | 'provider'
    /** A outra pessoa */
    counterpartId: string
    counterpartSlug?: string | null
    /** Pra mensagem pronta do WhatsApp */
    serviceTitle?: string
    onChanged?: () => void
}

interface ReviewRow { reviewer_id: string; rating: number; comment: string | null }

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
    return (
        <span className="inline-flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} size={size} className={n <= value ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'} />
            ))}
        </span>
    )
}

export default function ServiceExchangePanel({ applicationId, role, counterpartId, counterpartSlug, serviceTitle, onChanged }: Props) {
    const { colors } = useTheme()
    const [loading, setLoading] = useState(true)
    const [completedAt, setCompletedAt] = useState<string | null>(null)
    const [reviews, setReviews] = useState<ReviewRow[]>([])
    const [whatsapp, setWhatsapp] = useState<string | null>(null)
    const [myId, setMyId] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [rating, setRating] = useState(0)
    const [comment, setComment] = useState('')
    const [tipReceived, setTipReceived] = useState(false)
    const [tipVisible, setTipVisible] = useState(false)
    const [tip, setTip] = useState<{ tip_visible: boolean } | null>(null)

    const load = useCallback(async () => {
        const [{ data: userRes }, appRes, revRes, profRes, tipRes] = await Promise.all([
            supabase.auth.getUser(),
            supabase.from('service_applications').select('completed_at').eq('id', applicationId).maybeSingle(),
            supabase.from('service_reviews').select('reviewer_id, rating, comment').eq('application_id', applicationId),
            supabase.rpc('get_profile_whatsapp', { p_profile: counterpartId }),
            supabase.from('service_tips').select('tip_visible').eq('application_id', applicationId).maybeSingle(),
        ])
        setTip((tipRes.data as any) || null)
        setMyId(userRes.user?.id || null)
        setCompletedAt((appRes.data as any)?.completed_at || null)
        setReviews((revRes.data as ReviewRow[]) || [])
        setWhatsapp((profRes.data as string | null) || null)
        setLoading(false)
    }, [applicationId, counterpartId])

    useEffect(() => { load() }, [load])

    const markDone = async () => {
        setBusy(true)
        const { error } = await supabase.rpc('complete_service_application', { p_application: applicationId })
        setBusy(false)
        if (error) { toast.error(error.message); return }
        notifyServiceDecision(applicationId, 'completed')
        toast.success('Serviço marcado como feito')
        notifyServiceRequestsChanged()
        await load()
        onChanged?.()
    }

    const sendReview = async () => {
        if (rating < 1) { toast.error('Escolha de 1 a 5 estrelas'); return }
        setBusy(true)
        const { error } = await supabase.rpc('submit_service_review', { p_application: applicationId, p_rating: rating, p_comment: comment.trim() || null, p_tip_received: role === 'provider' && tipReceived, p_tip_visible: role === 'provider' && tipReceived && tipVisible })
        setBusy(false)
        if (error) { toast.error(error.message); return }
        toast.success('Avaliação enviada')
        notifyServiceRequestsChanged()
        await load()
        onChanged?.()
    }

    if (loading) return <div className="py-2 flex justify-center"><Spinner size={16} color={colors.textSecondary} /></div>

    const mine = reviews.find((r) => r.reviewer_id === myId) || null
    const theirs = reviews.find((r) => r.reviewer_id !== myId) || null
    const waHref = whatsapp
        ? getWhatsAppLink(whatsapp, encodeURIComponent(`Olá! Sobre o serviço${serviceTitle ? ` "${serviceTitle}"` : ''} que combinamos pelo iUser.`))
        : null
    const who = counterpartSlug ? `@${counterpartSlug}` : 'a outra pessoa'

    return (
        <div className="flex flex-col gap-2.5 mt-2" onClick={(e) => e.stopPropagation()}>
            {/* Contato */}
            {!completedAt && (
                <div className="flex gap-2">
                    {waHref && (
                        <a
                            href={waHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 py-2.5 rounded-full text-xs font-black flex items-center justify-center gap-1.5 text-white"
                            style={{ background: 'linear-gradient(135deg, #075e54, #25D366)' }}
                        >
                            <MessageCircle size={14} /> WhatsApp
                        </a>
                    )}
                    <div className="flex-1">
                        <ChatContactButton profileId={counterpartId} requestApplicationId={applicationId} colors={colors} variant="pill" label="Conversar" />
                    </div>
                </div>
            )}

            {/* Quem pediu: marcar como feito */}
            {role === 'owner' && !completedAt && (
                <button
                    onClick={markDone}
                    disabled={busy}
                    className="w-full py-2.5 rounded-full text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-60"
                    style={{ background: '#22c55e', color: '#fff' }}
                >
                    {busy ? <Spinner size={14} color="#fff" /> : <CheckCircle2 size={15} />}
                    Serviço feito
                </button>
            )}
            {role === 'provider' && !completedAt && (
                <p className="text-[11px] text-center" style={{ color: colors.textSecondary }}>
                    Quando {who} marcar o serviço como feito, vocês dois podem se avaliar.
                </p>
            )}

            {/* Feito: avaliação dos dois lados */}
            {completedAt && (
                <div className="rounded-2xl p-3 flex flex-col gap-2.5" style={{ background: '#22c55e12', border: '1px solid #22c55e44' }}>
                    <p className="text-xs font-black flex items-center gap-1.5" style={{ color: '#16a34a' }}>
                        <CheckCircle2 size={14} />
                        {role === 'owner' ? `Serviço feito por ${who}` : `Serviço feito pra ${who}`}
                    </p>

                    {theirs && (
                        <div>
                            <p className="text-[11px] font-bold" style={{ color: colors.textSecondary }}>{role === 'provider' ? `${who} avaliou o seu serviço` : `${who} avaliou você como contratante`}</p>
                            <Stars value={theirs.rating} />
                            {theirs.comment && <p className="text-xs mt-0.5 break-words" style={{ color: colors.textPrimary }}>“{theirs.comment}”</p>}
                            {role === 'owner' && tip && (
                                <p className="text-[11px] font-bold mt-1 flex items-center gap-1" style={{ color: '#d97706' }}>
                                    <Gift size={12} /> {who} agradece a gorjeta
                                </p>
                            )}
                        </div>
                    )}

                    {mine ? (
                        <div>
                            <p className="text-[11px] font-bold" style={{ color: colors.textSecondary }}>{role === 'provider' ? `Sua avaliação de ${who} como contratante` : `Sua avaliação do serviço de ${who}`}</p>
                            <Stars value={mine.rating} />
                            {mine.comment && <p className="text-xs mt-0.5 break-words" style={{ color: colors.textPrimary }}>“{mine.comment}”</p>}
                            {role === 'provider' && tip && (
                                <p className="text-[11px] font-bold mt-1 flex items-center gap-1" style={{ color: '#d97706' }}>
                                    <Gift size={12} /> Você recebeu gorjeta · {tip.tip_visible ? 'pode ser mostrada' : 'só você vê'}
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <div>
                                <p className="text-xs font-black" style={{ color: colors.textPrimary }}>
                                    {role === 'provider' ? `Avalie ${who} como contratante` : `Avalie o serviço de ${who}`}
                                </p>
                                <p className="text-[11px] mt-0.5" style={{ color: colors.textSecondary }}>
                                    {role === 'provider'
                                        ? 'Foi educado? Pagou direitinho? Foi bom de negociar? Sua avaliação ajuda outros profissionais a decidir.'
                                        : 'Como foi o serviço? Qualidade, pontualidade e atendimento ajudam outras pessoas a escolher.'}
                                </p>
                            </div>
                            <div className="flex items-center gap-1">
                                {[1, 2, 3, 4, 5].map((n) => (
                                    <button key={n} onClick={() => setRating(n)} aria-label={`${n} estrela${n > 1 ? 's' : ''}`}>
                                        <Star size={26} className={n <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'} />
                                    </button>
                                ))}
                            </div>
                            <textarea
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                rows={2}
                                maxLength={500}
                                placeholder={role === 'provider' ? 'Conte como foi trabalhar com essa pessoa (opcional)' : 'Conte como foi o serviço (opcional)'}
                                className="w-full resize-none rounded-xl px-3 py-2 text-sm focus:outline-none"
                                style={{ background: `${colors.border}25`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                            />
                            {role === 'provider' && (
                                <div className="rounded-xl p-2.5" style={{ background: `${colors.border}25`, border: `1px solid ${colors.border}` }}>
                                    <button type="button" onClick={() => { setTipReceived((v) => !v); if (tipReceived) setTipVisible(false) }} className="w-full flex items-center gap-2 text-left">
                                        <Gift size={15} style={{ color: '#d97706' }} className="flex-shrink-0" />
                                        <span className="flex-1 text-xs font-black" style={{ color: colors.textPrimary }}>Recebi uma gorjeta</span>
                                        <span className="w-10 h-6 rounded-full p-0.5 transition-colors flex-shrink-0" style={{ background: tipReceived ? '#16a34a' : colors.border }}>
                                            <span className="block w-5 h-5 rounded-full bg-white transition-transform shadow" style={{ transform: tipReceived ? 'translateX(16px)' : 'none' }} />
                                        </span>
                                    </button>
                                    {tipReceived && (
                                        <button type="button" onClick={() => setTipVisible((v) => !v)} className="w-full flex items-center gap-2 text-left mt-2 pt-2" style={{ borderTop: `1px solid ${colors.border}` }}>
                                            <span className="flex-1 text-[11px]" style={{ color: colors.textPrimary }}>
                                                Mostrar pros outros profissionais que {who} reconhece o trabalho com gorjeta
                                            </span>
                                            <span className="w-10 h-6 rounded-full p-0.5 transition-colors flex-shrink-0" style={{ background: tipVisible ? '#16a34a' : colors.border }}>
                                                <span className="block w-5 h-5 rounded-full bg-white transition-transform shadow" style={{ transform: tipVisible ? 'translateX(16px)' : 'none' }} />
                                            </span>
                                        </button>
                                    )}
                                    <p className="text-[10px] mt-1.5" style={{ color: colors.textSecondary }}>
                                        Gorjeta é um agrado, não uma obrigação. Não marcar nada não afeta ninguém.
                                    </p>
                                </div>
                            )}
                            <button
                                onClick={sendReview}
                                disabled={busy || rating < 1}
                                className="w-full py-2.5 rounded-full text-xs font-black text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                                style={{ background: GRADIENT }}
                            >
                                {busy ? <Spinner size={14} color="#fff" /> : 'Enviar avaliação'}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
