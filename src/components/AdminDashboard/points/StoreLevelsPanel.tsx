// src/components/AdminDashboard/points/StoreLevelsPanel.tsx — Admin → Pontuação → Lojas → "Níveis da loja".
// A escada que decide a moldura do logo: nome, pontos mínimos (do Outdoor de lojas), cores e se a moldura é animada. A regra de descida
// (quantos dias abaixo da linha até perder UM degrau) e o liga/desliga geral ficam em cima. Cada salvar confere a escada inteira e recalcula.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { toast } from '@/lib/toast'
import { callAdminApi } from '@/lib/callAdminApi'
import { Spinner } from '@/components/Spinner'
import { frameSpec, parseColorsInput, validateLevelEdit, validateLevelSettings, type StoreLevel } from '@/modules/store-levels'
import { Check, Field, inputStyle, type PanelProps } from './shared'

interface LevelRow { level: number; name: string; min_points: number; colors: string[]; animated: boolean; description: string | null; is_active: boolean }
interface Overview { levels: LevelRow[]; settings: { enabled: boolean; drop_after_days: number } | null; per_level: Record<string, number> }
interface Draft { name: string; min: string; colors: string; animated: boolean; active: boolean }
const draftOf = (l: LevelRow): Draft => ({ name: l.name, min: String(l.min_points), colors: (l.colors || []).join(', '), animated: l.animated, active: l.is_active })

/** miniatura do que o nível desenha (estática: sem a animação) */
function Preview({ d, level }: { d: Draft; level: number }) {
    const colors = parseColorsInput(d.colors)
    const lv: StoreLevel = { level, name: d.name, minPoints: 0, colors, animated: d.animated, description: null }
    const spec = frameSpec(lv, 44, { ring: 3, radius: 14 })
    const bg = spec ? (spec.background ?? `conic-gradient(${[...colors, colors[0]].join(', ')})`) : 'transparent'
    return (
        <span className="inline-block flex-shrink-0" style={{ padding: spec ? 3 : 0, borderRadius: 17, background: bg, boxShadow: spec?.glow }}>
            <span className="block w-11 h-11 rounded-[14px]" style={{ background: '#b91c1c' }} />
        </span>
    )
}

function LevelCard({ row, count, colors, cardStyle, reload }: { row: LevelRow; count: number } & PanelProps) {
    const [d, setD] = useState<Draft>(() => draftOf(row))
    const [busy, setBusy] = useState(false)
    const dirty = JSON.stringify(d) !== JSON.stringify(draftOf(row))
    const input = inputStyle(colors)
    const save = async () => {
        const msg = validateLevelEdit({ level: row.level, name: d.name, minPoints: Math.round(Number(d.min)), colors: parseColorsInput(d.colors), animated: d.animated, isActive: d.active })
        if (msg) { toast.error(msg); return }
        setBusy(true)
        try {
            const r = await callAdminApi<{ refresh_error?: string | null }>('/api/admin/store-levels', { action: 'save_level', level: row.level, name: d.name, min_points: Math.round(Number(d.min)), colors: parseColorsInput(d.colors), animated: d.animated, is_active: d.active })
            if (r.refresh_error) toast.error('Salvo, mas a recontagem falhou: ' + r.refresh_error)
            else toast.success('Nível salvo e lojas recalculadas!')
            await reload()
        } catch (e: any) { toast.error(e.message || 'Erro ao salvar') }
        setBusy(false)
    }
    return (
        <div style={{ ...cardStyle, opacity: d.active ? 1 : 0.65 }} className="space-y-3">
            <div className="flex items-center gap-3">
                <Preview d={d} level={row.level} />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Nível {row.level} · {d.name || '—'}</p>
                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>{count} {count === 1 ? 'loja' : 'lojas'} agora</p>
                </div>
                <button onClick={save} disabled={!dirty || busy} className="h-9 px-4 rounded-full text-xs font-black text-white flex items-center gap-1.5 disabled:opacity-40 active:scale-95" style={{ background: '#f97316' }}>
                    {busy ? <Spinner size={14} color="#fff" /> : <Save size={14} />}Salvar
                </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <Field colors={colors} label="Nome"><input style={input} value={d.name} maxLength={24} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
                <Field colors={colors} label="Pontos mínimos (Outdoor)"><input style={input} inputMode="numeric" value={d.min} disabled={row.level === 0} onChange={(e) => setD({ ...d, min: e.target.value.replace(/\D/g, '') })} /></Field>
            </div>
            <Field colors={colors} label="Cores da moldura" hint="Códigos separados por vírgula. Uma = fio; duas ou mais = degradê. Vazio = sem moldura."><input style={input} value={d.colors} onChange={(e) => setD({ ...d, colors: e.target.value })} placeholder="#f97316, #ef4444" /></Field>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
                <Check colors={colors} checked={d.animated} onChange={(v) => setD({ ...d, animated: v })}>Moldura animada (chama girando e coroa)</Check>
                {row.level !== 0 && <Check colors={colors} checked={d.active} onChange={(v) => setD({ ...d, active: v })}>Nível ligado</Check>}
            </div>
        </div>
    )
}

export default function StoreLevelsPanel({ colors, cardStyle }: PanelProps) {
    const [data, setData] = useState<Overview | null>(null)
    const [enabled, setEnabled] = useState(true)
    const [days, setDays] = useState('7')
    const [busy, setBusy] = useState(false)
    const load = useCallback(async () => {
        try {
            const o = await callAdminApi<Overview>('/api/admin/store-levels', { action: 'overview' })
            setData(o); setEnabled(o.settings?.enabled !== false); setDays(String(o.settings?.drop_after_days ?? 7))
        } catch (e: any) { toast.error(e.message || 'Erro ao carregar os níveis') }
    }, [])
    useEffect(() => { void load() }, [load])
    if (!data) return <div style={cardStyle} className="flex justify-center py-6"><Spinner size={22} color={colors.accent} /></div>

    const dirty = enabled !== (data.settings?.enabled !== false) || days !== String(data.settings?.drop_after_days ?? 7)
    const saveSettings = async () => {
        const msg = validateLevelSettings({ dropAfterDays: Math.round(Number(days)) })
        if (msg) { toast.error(msg); return }
        setBusy(true)
        try {
            await callAdminApi('/api/admin/store-levels', { action: 'save_settings', enabled, drop_after_days: Math.round(Number(days)) })
            toast.success('Regra salva e lojas recalculadas!')
            await load()
        } catch (e: any) { toast.error(e.message || 'Erro ao salvar') }
        setBusy(false)
    }
    const panelProps = { colors, cardStyle, reload: load }
    return (
        <div className="space-y-3">
            <div style={cardStyle} className="space-y-3">
                <div>
                    <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Níveis da loja (moldura do logo)</p>
                    <p className="text-[11px] mt-0.5 leading-snug" style={{ color: colors.textSecondary }}>O nível vem dos pontos do Outdoor de lojas. Sobe na hora; desce só UM degrau por vez, depois dos dias abaixo definidos aqui. A moldura da loja é quadrada (a do perfil é o anel redondo de metal).</p>
                </div>
                <div className="flex flex-wrap items-end gap-4">
                    <Check colors={colors} checked={enabled} onChange={setEnabled}>Molduras ligadas</Check>
                    <Field colors={colors} label="Dias abaixo da linha para descer um degrau"><input style={{ ...inputStyle(colors), width: 90 }} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} /></Field>
                    <button onClick={saveSettings} disabled={!dirty || busy} className="h-9 px-4 rounded-full text-xs font-black text-white flex items-center gap-1.5 disabled:opacity-40 active:scale-95" style={{ background: '#f97316' }}>
                        {busy ? <Spinner size={14} color="#fff" /> : <Save size={14} />}Salvar regra
                    </button>
                </div>
            </div>
            {data.levels.map((l) => <LevelCard key={`${l.level}-${l.name}-${l.min_points}-${(l.colors || []).join('')}-${l.is_active}-${l.animated}`} row={l} count={data.per_level[String(l.level)] || 0} {...panelProps} />)}
        </div>
    )
}
