// src/components/StoreDashboard/StoreDepositEditor.tsx
//
// Painel da loja: ENTRADA no agendamento (opcional). A loja escolhe sem entrada, uma porcentagem do valor (100% = valor total) ou um
// valor fixo, e escreve a política de cancelamento/devolução que o cliente vê antes de pagar. O cliente paga por Pix na chave da
// loja (o iUser não movimenta o dinheiro) e a loja confirma o recebimento em Compromissos. Só aparece com a agenda ligada.
// Vale na 2.0 e na 3.0 (mesmos campos; só usa as cores do tema).
'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { DEPOSIT_HOLD_MINUTES, depositConfigOf, type DepositMode } from '@/lib/appointmentDeposit'

const ORANGE = '#f97316'
const MODES: { id: DepositMode; label: string }[] = [
    { id: 'none', label: 'Sem entrada' },
    { id: 'percent', label: 'Porcentagem' },
    { id: 'fixed', label: 'Valor fixo' },
]

export default function StoreDepositEditor({ storeId }: { storeId: string }) {
    const { colors } = useTheme()
    const [loaded, setLoaded] = useState(false)
    const [agendaOn, setAgendaOn] = useState(false)
    const [hasPix, setHasPix] = useState(false)
    const [mode, setMode] = useState<DepositMode>('none')
    const [value, setValue] = useState('')
    const [policy, setPolicy] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        let alive = true
        supabase.from('my_stores').select('allow_scheduling, pix_key, deposit_mode, deposit_value, deposit_policy').eq('id', storeId).maybeSingle().then(({ data }) => {
            if (!alive || !data) { setLoaded(true); return }
            const r = data as any
            const cfg = depositConfigOf(r)
            setAgendaOn(!!r.allow_scheduling)
            setHasPix(!!(r.pix_key && String(r.pix_key).trim()))
            setMode(cfg.mode)
            setValue(cfg.mode === 'none' ? '' : String(cfg.value))
            setPolicy(cfg.policy || '')
            setLoaded(true)
        })
        return () => { alive = false }
    }, [storeId])

    if (!loaded || !agendaOn) return null
    const soft = `${colors.border}35`

    const save = async () => {
        const num = Number(String(value).replace(',', '.'))
        if (mode === 'percent' && !(num >= 1 && num <= 100)) return toast.error('Escolha uma porcentagem de 1 a 100.')
        if (mode === 'fixed' && !(num > 0 && num <= 100000)) return toast.error('Digite o valor da entrada em reais.')
        if (mode !== 'none' && !hasPix) return toast.error('Cadastre a chave Pix da loja (Formas de pagamento) para cobrar entrada.')
        setSaving(true)
        const { error } = await supabase.from('stores').update({
            deposit_mode: mode,
            deposit_value: mode === 'none' ? 0 : Math.round(num * 100) / 100,
            deposit_policy: mode === 'none' ? null : (policy.trim() || null),
        }).eq('id', storeId)
        setSaving(false)
        if (error) return toast.error('Não foi possível salvar: ' + error.message)
        toast.success(mode === 'none' ? 'Entrada desligada' : 'Entrada salva')
    }

    return (
        <section className="rounded-3xl p-4" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${ORANGE}1f`, color: ORANGE }}><Wallet size={20} /></span>
                <div className="min-w-0">
                    <h3 className="text-base font-black" style={{ color: colors.textPrimary }}>Entrada no agendamento</h3>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Opcional. O cliente paga por Pix na sua chave para segurar o horário.</p>
                </div>
            </div>

            <div className="mt-3 flex gap-1.5 flex-wrap">
                {MODES.map((m) => (
                    <button key={m.id} onClick={() => setMode(m.id)} className="h-9 px-4 rounded-full text-xs font-black transition active:scale-95" style={mode === m.id ? { background: ORANGE, color: '#fff' } : { background: soft, color: colors.textPrimary }}>{m.label}</button>
                ))}
            </div>

            {mode !== 'none' && (
                <>
                    {mode === 'percent' && (
                        <div className="mt-3 flex gap-1.5 flex-wrap">
                            {[30, 50, 100].map((p) => (
                                <button key={p} onClick={() => setValue(String(p))} className="h-8 px-3 rounded-full text-[11px] font-black" style={String(p) === value ? { background: `${ORANGE}22`, color: ORANGE } : { background: soft, color: colors.textSecondary }}>{p === 100 ? '100% (valor total)' : `${p}%`}</button>
                            ))}
                        </div>
                    )}
                    <label className="mt-3 block text-[11px] font-black" style={{ color: colors.textSecondary }}>{mode === 'percent' ? 'Porcentagem do valor dos serviços' : 'Valor da entrada (R$)'}</label>
                    <input
                        value={value}
                        onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ''))}
                        inputMode="decimal"
                        placeholder={mode === 'percent' ? 'Ex.: 30' : 'Ex.: 50,00'}
                        className="mt-1 w-full h-11 rounded-2xl px-4 text-sm focus:outline-none"
                        style={{ background: soft, color: colors.textPrimary }}
                    />
                    <label className="mt-3 block text-[11px] font-black" style={{ color: colors.textSecondary }}>Política de cancelamento e devolução (o cliente lê antes de pagar)</label>
                    <textarea
                        value={policy}
                        onChange={(e) => setPolicy(e.target.value.slice(0, 300))}
                        rows={2}
                        placeholder="Ex.: Devolvemos a entrada se você cancelar com 24 h de antecedência."
                        className="mt-1 w-full rounded-2xl px-4 py-3 text-sm resize-none focus:outline-none"
                        style={{ background: soft, color: colors.textPrimary }}
                    />
                    {!hasPix && <p className="mt-2 text-xs font-bold" style={{ color: '#ef4444' }}>Você ainda não cadastrou a chave Pix da loja. Cadastre em Formas de pagamento para ligar a entrada.</p>}
                    <p className="mt-2 text-[11px]" style={{ color: colors.textSecondary }}>O horário fica reservado por {DEPOSIT_HOLD_MINUTES} min esperando a entrada; sem pagamento, o agendamento é cancelado sozinho. Quando você receber o Pix, confirme em Compromissos.</p>
                </>
            )}

            <button onClick={save} disabled={saving} className="mt-3 w-full h-11 rounded-full text-sm font-black text-white transition active:scale-[0.98] disabled:opacity-60" style={{ background: ORANGE }}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </section>
    )
}
