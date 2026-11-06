// components/AdminDashboard/RideWaitSettingsCard.tsx — Admin → Tarifas → "Espera na corrida": as regras do iUser para o tempo de espera (valor por minuto, minutos grátis, limite).
// O passageiro pede, o motorista aprova e o valor é SEMPRE este (nem o motorista nem a loja mudam). A conta e a validação de verdade são do banco.
'use client'

import { useEffect, useState } from 'react'
import { Hourglass, Save } from 'lucide-react'
import type { ThemeColors } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/lib/toast'
import { callAdminApi } from '@/lib/callAdminApi'
import { centsToBrl, exampleWaitCents, loadWaitSettings, waitSettingsProblem, type WaitSettings } from '@/modules/ridewait'

const num = (v: string) => Number(String(v).replace(',', '.'))

export default function RideWaitSettingsCard({ cardStyle, colors, inputStyle }: { cardStyle: React.CSSProperties; colors: ThemeColors; inputStyle: React.CSSProperties }) {
    const [saved, setSaved] = useState<WaitSettings | null>(null)
    const [rate, setRate] = useState(''); const [grace, setGrace] = useState(''); const [max, setMax] = useState('')
    const [saving, setSaving] = useState(false)
    const fill = (s: WaitSettings) => { setSaved(s); setRate(String(s.ratePerMinute).replace('.', ',')); setGrace(String(s.graceMinutes)); setMax(String(s.maxMinutes)) }
    useEffect(() => { void loadWaitSettings().then(fill) }, [])

    const draft: WaitSettings = { ratePerMinute: num(rate), graceMinutes: num(grace), maxMinutes: num(max) }
    const problem = waitSettingsProblem(draft)
    const same = saved != null && saved.ratePerMinute === draft.ratePerMinute && saved.graceMinutes === draft.graceMinutes && saved.maxMinutes === draft.maxMinutes

    const save = async () => {
        if (problem) { toast.error(problem); return }
        setSaving(true)
        try {
            await callAdminApi('/api/admin/ride-wait', { rate: draft.ratePerMinute, grace: draft.graceMinutes, max: draft.maxMinutes })
            fill(draft)
            toast.success('Regras da espera salvas. Valem para as próximas esperas aprovadas.')
        } catch (err: any) { toast.error(err.message || 'Erro ao salvar as regras da espera') }
        finally { setSaving(false) }
    }

    const field = (label: string, value: string, set: (v: string) => void, max: number) => (
        <div className="flex-1 flex flex-col gap-0.5 min-w-0">
            <span className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>{label}</span>
            <input type="text" inputMode="decimal" value={value} onChange={(e) => set(e.target.value.replace(/[^\d.,]/g, '').slice(0, max))} style={inputStyle} />
        </div>
    )

    return (
        <div style={cardStyle} className="space-y-2">
            <p className="text-xs font-black flex items-center gap-1.5" style={{ color: colors.textPrimary }}><Hourglass size={14} /> Espera na corrida</p>
            <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                O passageiro pede tempo de espera (no embarque, numa parada ou no desembarque) e o <strong style={{ color: colors.textPrimary }}>motorista aprova</strong>; aí o relógio começa para os dois, com o valor subindo ao vivo.
                O valor é <strong style={{ color: colors.textPrimary }}>sempre este, do iUser</strong>: cada espera tem os seus minutos grátis e as esperas da corrida se somam ao valor combinado. O iUser não movimenta esse dinheiro (é pago entre os dois, como o resto da corrida). A mudança vale para as próximas esperas aprovadas; as que já estão correndo não mudam.
            </p>
            <div className="flex items-end gap-2">
                {field('R$ por minuto', rate, setRate, 6)}
                {field('Minutos grátis', grace, setGrace, 2)}
                {field('Limite de uma espera (min)', max, setMax, 3)}
            </div>
            {saved && !problem && (
                <p className="text-[11px] font-bold" style={{ color: '#16a34a' }}>
                    Ex.: 2 min = {centsToBrl(exampleWaitCents(2, draft))} · 10 min = {centsToBrl(exampleWaitCents(10, draft))} · 30 min = {centsToBrl(exampleWaitCents(30, draft))}. Uma espera esquecida aberta nunca cobra além de {draft.maxMinutes} min ({centsToBrl(exampleWaitCents(draft.maxMinutes, draft))}).
                </p>
            )}
            {problem && <p className="text-[11px] font-bold" style={{ color: '#b45309' }}>{problem}</p>}
            <button onClick={save} disabled={saving || saved == null || same || !!problem} className="px-4 py-2.5 rounded-xl text-xs font-black text-white disabled:opacity-50 flex items-center gap-1.5" style={{ background: colors.accent }}>
                {saving ? <Spinner size={14} /> : <Save size={14} />} Salvar
            </button>
        </div>
    )
}
