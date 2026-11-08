// src/components/AdminDashboard/points/SignalsPanel.tsx — Admin → Pontuação → um Outdoor (lojas, serviços, produtos, digitais, imóveis, motoristas).
// A pontuação de cada item é a soma de (peso × número que o banco já tem) de cada sinal. "Soma no total do dono" decide se o sinal também
// entra no Placar do perfil de quem é o dono (venda e nota somam; visita à página e compartilhamento ficam de fora, são fáceis de inflar).
'use client'

import { useState } from 'react'
import { Save } from 'lucide-react'
import { toast } from '@/lib/toast'
import { callAdminApi } from '@/lib/callAdminApi'
import { Spinner } from '@/components/Spinner'
import { AREA_INFO, validateSignal, type PointsArea } from '@/modules/points'
import { OUTDOOR_INFO, type OutdoorKind } from '@/modules/outdoor'
import { Check, Field, inputStyle, type PanelProps, type SignalRow } from './shared'

interface Draft { weight: string; max: string; active: boolean; rolls: boolean }
const draftOf = (s: SignalRow): Draft => ({ weight: String(s.weight), max: s.max_units == null ? '' : String(s.max_units), active: s.is_active, rolls: s.rolls_up })

function SignalCard({ s, colors, cardStyle, reload }: { s: SignalRow } & PanelProps) {
    const [d, setD] = useState<Draft>(() => draftOf(s))
    const [busy, setBusy] = useState(false)
    const dirty = JSON.stringify(d) !== JSON.stringify(draftOf(s))
    const input = inputStyle(colors)
    const penalty = Number(d.weight) < 0

    const save = async () => {
        const msg = validateSignal({ weight: d.weight, maxUnits: d.max })
        if (msg) { toast.error(msg); return }
        setBusy(true)
        try {
            const r = await callAdminApi<{ refresh_error?: string | null }>('/api/admin/points', { action: 'save_signal', kind: s.kind, signal: s.signal, weight: Number(d.weight), max_units: d.max, is_active: d.active, rolls_up: d.rolls })
            if (r.refresh_error) toast.error('Salvo, mas a recontagem falhou: ' + r.refresh_error)
            else toast.success('Salvo e recalculado!')
            await reload()
        } catch (e: any) { toast.error(e.message || 'Erro ao salvar') }
        setBusy(false)
    }

    return (
        <div style={cardStyle} className="space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-black" style={{ color: colors.textPrimary }}>{s.label}</p>
                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>{penalty ? 'Penalidade: tira pontos de cada unidade.' : 'Pontos por cada unidade.'}</p>
                </div>
                <Check colors={colors} checked={d.active} onChange={(v) => setD({ ...d, active: v })}>Valendo</Check>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <Field colors={colors} label="Peso (pontos por unidade)" hint="aceita decimais (0,05) e negativo"><input type="number" step="any" value={d.weight} onChange={(e) => setD({ ...d, weight: e.target.value })} style={input} /></Field>
                <Field colors={colors} label="Teto de unidades" hint="vazio = sem teto"><input type="number" step="any" min={0} value={d.max} onChange={(e) => setD({ ...d, max: e.target.value })} style={input} /></Field>
            </div>
            <Check colors={colors} checked={d.rolls} onChange={(v) => setD({ ...d, rolls: v })}>Também soma no total do dono (Placar do perfil)</Check>
            <button onClick={save} disabled={busy || !dirty} className="flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-black text-white disabled:opacity-50" style={{ background: colors.accent }}>
                {busy ? <Spinner size={14} color="#fff" /> : <Save size={14} />} Salvar e recalcular
            </button>
        </div>
    )
}

export default function SignalsPanel({ kind, signals, colors, cardStyle, reload }: { kind: Exclude<PointsArea, 'pessoa'>; signals: SignalRow[] } & PanelProps) {
    const info = OUTDOOR_INFO[kind as OutdoorKind]
    const mine = signals.filter((s) => s.kind === kind).sort((a, b) => a.sort_order - b.sort_order)
    return (
        <div className="space-y-4">
            <div style={cardStyle} className="space-y-1">
                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>{info.title}</p>
                <p className="text-xs" style={{ color: colors.textSecondary }}>
                    {info.subtitle}. {AREA_INFO[kind].hint}. A pontuação de cada item é a soma de <b>peso × número</b> de cada sinal abaixo, calculada a cada 5 minutos
                    (e na hora quando você salva). Quem soma mais fica em primeiro.
                </p>
            </div>
            {mine.length === 0 ? <div style={cardStyle}><p className="text-xs" style={{ color: colors.textSecondary }}>Este tipo ainda não tem sinais.</p></div>
                : mine.map((s) => <SignalCard key={`${s.kind}.${s.signal}`} s={s} colors={colors} cardStyle={cardStyle} reload={reload} />)}
        </div>
    )
}
