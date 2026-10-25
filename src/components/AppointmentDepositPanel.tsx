// src/components/AppointmentDepositPanel.tsx
//
// A entrada de UM agendamento da loja, para os dois lados (2.0 e 3.0):
//  - CLIENTE: valor, prazo, chave Pix da loja (copiar), política de devolução e "Já paguei". O horário fica reservado até o prazo.
//  - LOJA: "o cliente deve R$ X" e "Recebi a entrada" (confirma a entrada e o agendamento) e, depois, "Marcar como devolvida".
// O iUser só registra: o dinheiro vai por Pix direto para a loja. As regras (valor, prazo, quem pode o quê) são do banco
// (migration 20261116): get_appointment_deposit / report_appointment_deposit / confirm_appointment_deposit / refund_appointment_deposit.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { brl, DEPOSIT_STATUS_LABEL, type DepositStatus } from '@/lib/appointmentDeposit'

interface DepositView {
    deposit_amount: number
    deposit_status: DepositStatus
    deposit_due_at: string | null
    appointment_status: string
    store_name: string
    policy: string | null
    pix_key: string | null
    pix_key_type: string | null
}

export interface DepositPalette { textPrimary: string; textSecondary: string; surface: string; border: string; accent: string }

const ORANGE = '#f97316'

function useCountdown(dueAt: string | null) {
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        if (!dueAt) return
        const t = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(t)
    }, [dueAt])
    if (!dueAt) return null
    const ms = new Date(dueAt).getTime() - now
    if (ms <= 0) return '00:00'
    const s = Math.floor(ms / 1000)
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function AppointmentDepositPanel({ appointmentId, role, palette, onChanged }: { appointmentId: string; role: 'customer' | 'owner'; palette?: DepositPalette; onChanged?: () => void }) {
    const { colors } = useTheme()
    const c = palette || { textPrimary: colors.textPrimary, textSecondary: colors.textSecondary, surface: colors.surface, border: colors.border, accent: colors.accent }
    const [view, setView] = useState<DepositView | null | undefined>(undefined)
    const [busy, setBusy] = useState(false)
    const [copied, setCopied] = useState(false)

    const load = useCallback(async () => {
        const { data, error } = await supabase.rpc('get_appointment_deposit', { p_appointment: appointmentId })
        const row = (data as DepositView[] | null)?.[0]
        setView(error || !row ? null : { ...row, deposit_amount: Number(row.deposit_amount) })
    }, [appointmentId])

    useEffect(() => { load() }, [load])
    // enquanto espera pagamento ou confirmação, confere de vez em quando (a loja pode ter confirmado)
    useEffect(() => {
        if (!view || (view.deposit_status !== 'awaiting' && view.deposit_status !== 'reported')) return
        const t = setInterval(() => { if (!document.hidden) load() }, 15000)
        return () => clearInterval(t)
    }, [view?.deposit_status, load])

    const countdown = useCountdown(view?.deposit_status === 'awaiting' ? view.deposit_due_at : null)

    if (!view || view.deposit_status === 'none') return null

    const act = async (fn: 'report_appointment_deposit' | 'confirm_appointment_deposit' | 'refund_appointment_deposit', ok: string) => {
        setBusy(true)
        const { error } = await supabase.rpc(fn, { p_appointment: appointmentId })
        setBusy(false)
        if (error) return toast.error(error.message)
        toast.success(ok)
        await load()
        onChanged?.()
    }
    const copyPix = async () => {
        if (!view.pix_key) return
        try { await navigator.clipboard.writeText(view.pix_key); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { toast.error('Não foi possível copiar. Selecione a chave e copie.') }
    }

    const soft = `${c.border}40`
    const st = view.deposit_status
    const open = st === 'awaiting' || st === 'reported'

    return (
        <section className="rounded-3xl p-4" style={{ background: soft }}>
            <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${ORANGE}22`, color: ORANGE }}><Wallet size={18} /></span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-black" style={{ color: c.textPrimary }}>
                        {role === 'customer'
                            ? (st === 'awaiting' ? 'Pague a entrada para garantir o horário' : st === 'reported' ? 'Pagamento informado' : DEPOSIT_STATUS_LABEL[st])
                            : (open ? 'Entrada do cliente' : DEPOSIT_STATUS_LABEL[st])}
                    </p>
                    <p className="text-lg font-black leading-tight" style={{ color: ORANGE }}>{brl(view.deposit_amount)}</p>
                </div>
                {st === 'awaiting' && countdown && (
                    <span className="flex-shrink-0 text-xs font-black px-2.5 py-1 rounded-full" style={{ background: '#ef44441f', color: '#ef4444' }} title="Tempo que o horário fica reservado">{countdown}</span>
                )}
                {st === 'paid' && <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ background: '#16a34a' }}><Check size={15} strokeWidth={3} /></span>}
            </div>

            {role === 'customer' && open && (
                <>
                    {view.pix_key && (
                        <div className="mt-3">
                            <p className="text-[11px] font-black" style={{ color: c.textSecondary }}>Chave Pix de {view.store_name}{view.pix_key_type ? ` (${({ cpf: 'CPF', cnpj: 'CNPJ', email: 'e-mail', phone: 'celular', random: 'aleatória' } as Record<string, string>)[view.pix_key_type] || view.pix_key_type})` : ''}</p>
                            <button onClick={copyPix} className="mt-1 w-full rounded-2xl px-4 py-3 flex items-center gap-2 text-left transition active:scale-[0.99]" style={{ background: c.surface, color: c.textPrimary }}>
                                <span className="flex-1 min-w-0 text-sm font-black break-all">{view.pix_key}</span>
                                <span className="flex items-center gap-1 text-[11px] font-black flex-shrink-0" style={{ color: ORANGE }}>{copied ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}</span>
                            </button>
                        </div>
                    )}
                    {view.policy && <p className="mt-3 text-xs leading-snug" style={{ color: c.textSecondary }}><b style={{ color: c.textPrimary }}>Cancelamento:</b> {view.policy}</p>}
                    {st === 'awaiting' ? (
                        <>
                            <p className="mt-3 text-[11px]" style={{ color: c.textSecondary }}>Pague o valor acima por Pix e toque em “Já paguei”. Sem a entrada no prazo, o agendamento é cancelado e o horário volta a ficar livre.</p>
                            <button onClick={() => act('report_appointment_deposit', 'Avisamos a loja. Ela confirma o recebimento.')} disabled={busy} className="mt-3 w-full h-12 rounded-full text-sm font-black text-white transition active:scale-[0.98] disabled:opacity-60" style={{ background: ORANGE }}>{busy ? 'Enviando...' : 'Já paguei'}</button>
                        </>
                    ) : (
                        <p className="mt-3 text-xs font-bold" style={{ color: c.textSecondary }}>A loja foi avisada e vai confirmar o recebimento. Você recebe o aviso quando o agendamento for confirmado.</p>
                    )}
                </>
            )}

            {role === 'owner' && open && (
                <>
                    <p className="mt-2 text-xs" style={{ color: c.textSecondary }}>{st === 'reported' ? 'O cliente informou que pagou por Pix. Confira na sua conta antes de confirmar.' : 'O cliente ainda não informou o pagamento. Se já recebeu o Pix, confirme.'}</p>
                    <button onClick={() => act('confirm_appointment_deposit', 'Entrada confirmada e agendamento confirmado.')} disabled={busy} className="mt-3 w-full h-12 rounded-full text-sm font-black text-white transition active:scale-[0.98] disabled:opacity-60" style={{ background: ORANGE }}>{busy ? 'Confirmando...' : 'Recebi a entrada · confirmar agendamento'}</button>
                </>
            )}

            {st === 'paid' && (
                <>
                    <p className="mt-2 text-xs" style={{ color: c.textSecondary }}>{role === 'customer' ? `Entrada confirmada por ${view.store_name}. Agendamento confirmado.` : 'Entrada recebida e agendamento confirmado.'}</p>
                    {role === 'owner' && (
                        <button onClick={() => act('refund_appointment_deposit', 'Marcado como devolvida.')} disabled={busy} className="mt-2 text-xs font-black underline" style={{ color: c.textSecondary }}>Marcar entrada como devolvida</button>
                    )}
                </>
            )}
            {st === 'expired' && <p className="mt-2 text-xs" style={{ color: c.textSecondary }}>O prazo para pagar acabou e o horário foi liberado.</p>}
            {st === 'refunded' && <p className="mt-2 text-xs" style={{ color: c.textSecondary }}>A loja registrou a devolução da entrada.</p>}
        </section>
    )
}
