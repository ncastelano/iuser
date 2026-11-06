// src/components/club/ClubPayDialog.tsx — assinar (ou renovar) o clube de uma loja: a folha (portal no body) mostra o valor e a chave Pix da loja para copiar; a pessoa paga no app do banco e toca
// "Já fiz o Pix"; a loja confere na conta e confirma (+30 dias). O iUser NÃO movimenta o dinheiro (como na gorjeta). Não há renovação automática: a folha diz isso e o cartão avisa quando está para vencer.
// Regras no banco (migration 20261130000034). Controlado pelo pai: <ClubPayDialog open onClose onDone storeId storeName />.
'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, Crown, X } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { toast } from '@/lib/toast'
import { moneyText, CLUB_PERIOD_DAYS, reportClubPaid, startClubPayment, type ClubPayment } from '@/modules/club'
import { PIX_TYPE_LABEL } from '@/modules/tips'

const GRADIENT = 'linear-gradient(135deg, #a855f7, #6366f1)'

export default function ClubPayDialog({ open, onClose, onDone, storeId, storeName, includesMusic }: { open: boolean; onClose: () => void; onDone?: () => void; storeId: string; storeName: string; includesMusic?: boolean }) {
    const { colors } = useTheme()
    const [pay, setPay] = useState<ClubPayment | null>(null)
    const [step, setStep] = useState<'pay' | 'done'>('pay')
    const [busy, setBusy] = useState(false)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        if (!open) return
        let on = true
        setStep('pay'); setPay(null)
        startClubPayment(storeId).then((p) => { if (on) setPay(p) }).catch((e: any) => { if (on) { toast.error(e?.message || 'Não foi possível começar a assinatura.'); onClose() } })
        return () => { on = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, storeId])

    if (!open || typeof document === 'undefined') return null
    const copy = async () => { if (!pay) return; try { await navigator.clipboard.writeText(pay.pixKey); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { toast.error('Não foi possível copiar. Selecione a chave e copie.') } }
    const paid = async () => {
        if (!pay) return
        setBusy(true)
        try { await reportClubPaid(pay.id); setStep('done'); onDone?.() } catch (e: any) { toast.error(e?.message || 'Não deu certo.') } finally { setBusy(false) }
    }
    const close = () => { if (!busy) onClose() }

    return createPortal(
        <div className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={close}>
            <div className="w-full max-w-sm max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 flex flex-col gap-3" style={{ background: colors.surface, color: colors.textPrimary, paddingBottom: 'calc(20px + var(--staging-bar, 0px))' }} onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h3 className="text-base font-black flex items-center gap-2"><Crown size={16} style={{ color: '#a855f7' }} /> Clube de {storeName}</h3>
                    <button onClick={close} aria-label="Fechar"><X size={20} style={{ color: colors.textSecondary }} /></button>
                </div>

                {step === 'pay' && !pay && <p className="text-[13px] py-6 text-center" style={{ color: colors.textSecondary }}>Preparando…</p>}
                {step === 'pay' && pay && (
                    <>
                        <p className="text-[13px]">Assine por <b>{moneyText(pay.amountCents)}</b> por mês{includesMusic ? ' e ouça todas as músicas da loja' : ''}. Pague por Pix para a chave de <b>{pay.storeName}</b>{pay.pixKeyType ? ` (${PIX_TYPE_LABEL[pay.pixKeyType] || pay.pixKeyType})` : ''}:</p>
                        <button onClick={copy} className="rounded-2xl px-4 py-3 flex items-center gap-2 text-left active:scale-[0.99]" style={{ background: `${colors.border}30` }}>
                            <span className="flex-1 min-w-0 text-sm font-black break-all">{pay.pixKey}</span>
                            {copied ? <Check size={18} style={{ color: '#16a34a' }} /> : <Copy size={18} style={{ color: colors.textSecondary }} />}
                        </button>
                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>Depois de pagar no app do seu banco, toque abaixo. A loja confere na conta e confirma: cada pagamento vale {CLUB_PERIOD_DAYS} dias. Não renova sozinho — pague de novo antes de vencer. O dinheiro vai direto para a loja; o iUser não fica com nada.</p>
                        <button onClick={paid} disabled={busy} className="h-12 rounded-full text-[14px] font-black text-white disabled:opacity-50 active:scale-95" style={{ background: GRADIENT }}>{busy ? 'Enviando…' : 'Já fiz o Pix'}</button>
                    </>
                )}
                {step === 'done' && (
                    <div className="flex flex-col items-center gap-2 py-4 text-center">
                        <span className="w-14 h-14 rounded-full flex items-center justify-center text-white" style={{ background: GRADIENT }}><Crown size={26} /></span>
                        <p className="text-base font-black">Pagamento enviado!</p>
                        <p className="text-[12px]" style={{ color: colors.textSecondary }}>Assim que a loja confirmar o Pix, o clube abre{includesMusic ? ' e você já pode ouvir as músicas' : ''}. Você vê a situação no cartão do clube.</p>
                        <button onClick={onClose} className="mt-2 h-11 px-6 rounded-full text-sm font-black" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>Fechar</button>
                    </div>
                )}
            </div>
        </div>,
        document.body,
    )
}
