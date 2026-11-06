// src/components/moderation/ReportButton.tsx
//
// "Denunciar" (2.0 e 3.0): um botão pequeno de bandeira que abre uma folha com o MOTIVO (e uma observação opcional). Vale para flash, comentário de flash, publicação, comentário, avaliação e
// mensagem de comunidade. Não aparece para o autor do conteúdo. 3 pessoas diferentes denunciando ocultam o conteúdo até o admin decidir (regra no banco). A folha usa portal no body para
// ficar acima da ilha e da barra.
'use client'

import { useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Flag, X } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { toast } from '@/lib/toast'
import { REASONS, reportContent, resultText, TARGET_LABEL, type ReportReason, type ReportTarget } from '@/modules/moderation'

export default function ReportButton({ type, id, authorId, label, size = 14, className = '', style }: { type: ReportTarget; id: string; authorId?: string | null; label?: string; size?: number; className?: string; style?: CSSProperties }) {
    const { colors } = useTheme()
    const { userId } = useProfile()
    const [open, setOpen] = useState(false)
    const [reason, setReason] = useState<ReportReason | null>(null)
    const [note, setNote] = useState('')
    const [busy, setBusy] = useState(false)
    if (authorId && userId && authorId === userId) return null   // ninguém denuncia o que é seu

    const start = (e: React.MouseEvent) => {
        e.stopPropagation(); e.preventDefault()
        if (!userId) { toast.info('Entre na sua conta para denunciar.'); return }
        setOpen(true)
    }
    const send = async () => {
        if (!reason) return
        setBusy(true)
        try { const r = await reportContent(type, id, reason, note); toast.success(resultText(r)); setOpen(false); setReason(null); setNote('') }
        catch (err: any) { toast.error(err?.message || 'Não deu certo.') } finally { setBusy(false) }
    }

    return (
        <>
            <button onClick={start} aria-label="Denunciar" title="Denunciar" className={`inline-flex items-center gap-1 active:scale-90 transition ${className}`} style={{ color: colors.textSecondary, ...style }}>
                <Flag size={size} />{label ? <span className="text-[11px] font-bold">{label}</span> : null}
            </button>
            {open && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => !busy && setOpen(false)}>
                    <div className="w-full max-w-sm max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 flex flex-col gap-3" style={{ background: colors.surface, color: colors.textPrimary, paddingBottom: 'calc(20px + var(--staging-banner-h, 0px) + env(safe-area-inset-bottom))' }} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-black flex items-center gap-2"><Flag size={16} style={{ color: '#ef4444' }} /> Denunciar {TARGET_LABEL[type].toLowerCase()}</h3>
                            <button onClick={() => setOpen(false)} aria-label="Fechar"><X size={20} style={{ color: colors.textSecondary }} /></button>
                        </div>
                        <p className="text-[12px]" style={{ color: colors.textSecondary }}>Qual é o problema? A sua denúncia é anônima para o autor.</p>
                        <div className="flex flex-col gap-1.5">
                            {REASONS.map((r) => (
                                <button key={r.code} onClick={() => setReason(r.code)} className="text-left rounded-2xl px-3 py-2 active:scale-[0.99]" style={reason === r.code ? { background: '#ef444418', border: '1.5px solid #ef4444' } : { background: `${colors.border}30`, border: '1.5px solid transparent' }}>
                                    <span className="block text-[13px] font-black">{r.label}</span>
                                    <span className="block text-[11px]" style={{ color: colors.textSecondary }}>{r.hint}</span>
                                </button>
                            ))}
                        </div>
                        <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} rows={2} placeholder="Quer explicar melhor? (opcional)" className="rounded-xl p-2.5 text-[13px] outline-none resize-none" style={{ background: `${colors.border}30`, color: colors.textPrimary }} />
                        <button onClick={send} disabled={!reason || busy} className="h-11 rounded-full text-[14px] font-black text-white disabled:opacity-40 active:scale-95" style={{ background: '#ef4444' }}>{busy ? 'Enviando…' : 'Enviar denúncia'}</button>
                    </div>
                </div>,
                document.body,
            )}
        </>
    )
}
