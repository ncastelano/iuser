// src/components/tips/TipButton.tsx — "Apoiar o artista": um botão que abre uma folha (portal no body) em 3 passos — valor (toques de R$ 5/10/20/50 ou outro valor, recado opcional),
// Pix (a chave da loja para copiar + "Já fiz o Pix") e agradecimento. O iUser não movimenta o dinheiro: o Pix vai direto para a loja, que confere e confirma. Some se a loja não
// recebe apoio (sem chave Pix, desligado) ou se quem vê é a dona. Regras no banco (migration 20261130000029).
'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Check, Copy, Heart, X } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { toast } from '@/lib/toast'
import { createTip, fetchTipsInfo, formatCents, parseAmountCents, PIX_TYPE_LABEL, reportTipPaid, supportersLabel, TIP_MESSAGE_MAX, TIP_PRESETS, validateTipAmount, type CreatedTip, type TipsInfo } from '@/modules/tips'

export default function TipButton({ storeId, storeName, productId, label = 'Apoiar o artista', className = '' }: { storeId: string; storeName: string; productId?: string | null; label?: string; className?: string }) {
    const { colors } = useTheme()
    const { userId } = useProfile()
    const router = useRouter()
    const [info, setInfo] = useState<TipsInfo | null>(null)
    const [open, setOpen] = useState(false)
    const [step, setStep] = useState<'amount' | 'pay' | 'done'>('amount')
    const [preset, setPreset] = useState<number | null>(1000)
    const [custom, setCustom] = useState('')
    const [message, setMessage] = useState('')
    const [busy, setBusy] = useState(false)
    const [tip, setTip] = useState<CreatedTip | null>(null)
    const [copied, setCopied] = useState(false)

    useEffect(() => { let on = true; fetchTipsInfo(storeId).then((i) => { if (on) setInfo(i) }); return () => { on = false } }, [storeId, userId])
    if (!info || !info.enabled || info.isOwner) return null

    const cents = custom.trim() ? parseAmountCents(custom) : preset
    const amountError = custom.trim() ? validateTipAmount(cents) : null
    const start = () => {
        if (!userId) { toast.info('Entre na sua conta para apoiar.'); router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`); return }
        setStep('amount'); setTip(null); setOpen(true)
    }
    const close = () => { if (!busy) setOpen(false) }
    const next = async () => {
        const err = validateTipAmount(cents ?? null)
        if (err || cents == null) { toast.error(err || 'Escolha um valor.'); return }
        setBusy(true)
        try { setTip(await createTip({ storeId, amountCents: cents, productId, message })); setStep('pay') } catch (e: any) { toast.error(e?.message || 'Não deu certo.') } finally { setBusy(false) }
    }
    const copy = async () => { if (!tip) return; try { await navigator.clipboard.writeText(tip.pixKey); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { toast.error('Não foi possível copiar. Selecione a chave e copie.') } }
    const paid = async () => {
        if (!tip) return
        setBusy(true)
        try { await reportTipPaid(tip.id); setStep('done') } catch (e: any) { toast.error(e?.message || 'Não deu certo.') } finally { setBusy(false) }
    }

    return (
        <>
            <button type="button" onClick={start} className={`inline-flex items-center justify-center gap-2 h-11 px-4 rounded-full text-sm font-black transition active:scale-95 ${className}`} style={{ background: '#ec489918', color: '#db2777', border: '1.5px solid #ec489940' }}>
                <Heart size={16} /> {label}{supportersLabel(info.supporters) ? <span className="text-[11px] font-bold opacity-80">· {supportersLabel(info.supporters)}</span> : null}
            </button>
            {open && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={close}>
                    <div className="w-full max-w-sm max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 flex flex-col gap-3" style={{ background: colors.surface, color: colors.textPrimary, paddingBottom: 'calc(20px + var(--staging-banner-h, 0px) + env(safe-area-inset-bottom))' }} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-black flex items-center gap-2"><Heart size={16} style={{ color: '#ec4899' }} /> Apoiar {storeName}</h3>
                            <button onClick={close} aria-label="Fechar"><X size={20} style={{ color: colors.textSecondary }} /></button>
                        </div>

                        {step === 'amount' && (
                            <>
                                <p className="text-[12px]" style={{ color: colors.textSecondary }}>Um agradecimento em dinheiro, direto para quem faz. Vai por Pix para a loja — o iUser não fica com nada.</p>
                                <div className="grid grid-cols-4 gap-2">
                                    {TIP_PRESETS.map((c) => (
                                        <button key={c} type="button" onClick={() => { setPreset(c); setCustom('') }} className="h-12 rounded-2xl text-[13px] font-black active:scale-95" style={!custom.trim() && preset === c ? { background: '#ec4899', color: '#fff' } : { background: `${colors.border}35`, color: colors.textPrimary }}>{formatCents(c).replace(',00', '')}</button>
                                    ))}
                                </div>
                                <input value={custom} onChange={(e) => setCustom(e.target.value)} inputMode="decimal" placeholder="Outro valor (ex.: 7,50)" className="h-11 rounded-full px-4 text-sm outline-none" style={{ background: `${colors.border}30`, color: colors.textPrimary, border: `1px solid ${amountError ? '#ef4444' : colors.border}` }} />
                                {amountError && <p className="text-[11px] font-bold" style={{ color: '#ef4444' }}>{amountError}</p>}
                                <textarea value={message} onChange={(e) => setMessage(e.target.value.slice(0, TIP_MESSAGE_MAX))} rows={2} placeholder="Um recado para o artista (opcional)" className="rounded-xl p-2.5 text-[13px] outline-none resize-none" style={{ background: `${colors.border}30`, color: colors.textPrimary }} />
                                <button onClick={next} disabled={busy || cents == null || !!validateTipAmount(cents ?? null)} className="h-12 rounded-full text-[14px] font-black text-white disabled:opacity-40 active:scale-95" style={{ background: '#ec4899' }}>{busy ? 'Aguarde…' : `Continuar · ${cents != null && !validateTipAmount(cents) ? formatCents(cents) : ''}`}</button>
                            </>
                        )}

                        {step === 'pay' && tip && (
                            <>
                                <p className="text-[13px]">Pague <b>{formatCents(tip.amountCents)}</b> por Pix para a chave de <b>{tip.storeName}</b>{tip.pixKeyType ? ` (${PIX_TYPE_LABEL[tip.pixKeyType] || tip.pixKeyType})` : ''}:</p>
                                <button onClick={copy} className="rounded-2xl px-4 py-3 flex items-center gap-2 text-left active:scale-[0.99]" style={{ background: `${colors.border}30` }}>
                                    <span className="flex-1 min-w-0 text-sm font-black break-all">{tip.pixKey}</span>
                                    {copied ? <Check size={18} style={{ color: '#16a34a' }} /> : <Copy size={18} style={{ color: colors.textSecondary }} />}
                                </button>
                                <p className="text-[11px]" style={{ color: colors.textSecondary }}>Depois de pagar no app do seu banco, toque abaixo. A loja confere na conta e confirma o recebimento.</p>
                                <button onClick={paid} disabled={busy} className="h-12 rounded-full text-[14px] font-black text-white disabled:opacity-50 active:scale-95" style={{ background: '#ec4899' }}>{busy ? 'Enviando…' : 'Já fiz o Pix'}</button>
                            </>
                        )}

                        {step === 'done' && (
                            <div className="flex flex-col items-center gap-2 py-4 text-center">
                                <span className="w-14 h-14 rounded-full flex items-center justify-center text-white" style={{ background: '#ec4899' }}><Heart size={26} fill="#fff" /></span>
                                <p className="text-base font-black">Obrigado pelo apoio!</p>
                                <p className="text-[12px]" style={{ color: colors.textSecondary }}>A loja vai conferir o Pix e confirmar. Isso faz diferença para quem cria.</p>
                                <button onClick={() => setOpen(false)} className="mt-2 h-11 px-6 rounded-full text-sm font-black" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>Fechar</button>
                            </div>
                        )}
                    </div>
                </div>,
                document.body,
            )}
        </>
    )
}
