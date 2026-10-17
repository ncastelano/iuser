// src/components/AdminDashboard/DeliverySettingsSection.tsx
//
// Admin → Entregas: regras GLOBAIS da entrega iUser (padrão único do iUser; a loja não define nada disso).
// Organizada em grupos recolhíveis, com unidades e linguagem humana. A validação de coerência é a mesma do servidor
// (módulo delivery-settings); o servidor e o banco validam de novo. A tarifa base/km/extras fica na aba Tarifas.
// Parte dessas regras ainda não é usada pelo fluxo atual (preparo do novo fluxo): o aviso no topo diz isso.
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import { callAdminApi } from '@/lib/callAdminApi'
import { Spinner } from '@/components/Spinner'
import type { ThemeColors } from '@/app/contexts/theme'
import { FIELDS, GROUPS, validateDeliverySettings, formatSettingValue, labelOfSetting, type FieldDef, type GroupId } from '@/modules/delivery-settings'

type Form = Record<string, string | boolean>
interface AuditRow { id: string; setting: string; old_value: unknown; new_value: unknown; changed_at: string; changed_by_label: string }
interface LoadResult {
    settings: Record<string, unknown>
    tariff: { base_distance_km: number; base_fee: number; price_per_km: number; extra_fee_objeto: number } | null
    audit: AuditRow[]
}

const UNIT: Record<string, string> = { money: 'R$', percent: '%', km: 'km', minutes: 'min', seconds: 's', count: '' }

const toForm = (s: Record<string, unknown>): Form => {
    const f: Form = {}
    for (const def of FIELDS) {
        const v = s[def.key]
        f[def.key] = def.kind === 'bool' ? Boolean(v) : v === null || v === undefined ? '' : String(v)
    }
    return f
}

export default function DeliverySettingsSection({ cardStyle, colors }: { cardStyle: React.CSSProperties; colors: ThemeColors }) {
    const [data, setData] = useState<LoadResult | null>(null)
    const [form, setForm] = useState<Form | null>(null)
    const [saved, setSaved] = useState<Form | null>(null)
    const [saving, setSaving] = useState(false)
    const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
    const [open, setOpen] = useState<Record<string, boolean>>({ busca: true, aumento: true })
    const [showHistory, setShowHistory] = useState(false)

    const load = useCallback(async () => {
        const res = await callAdminApi<LoadResult>('/api/admin/delivery-settings/load')
        setData(res)
        const f = toForm(res.settings)
        setForm(f)
        setSaved(f)
        setServerErrors({})
    }, [])

    useEffect(() => { load().catch((e) => toast.error(e.message || 'Erro ao carregar')) }, [load])

    const validation = useMemo(() => (form ? validateDeliverySettings(form) : null), [form])
    const errors: Record<string, string> = { ...(validation && !validation.ok ? (validation.errors as Record<string, string>) : {}), ...serverErrors }
    const dirty = !!form && !!saved && FIELDS.some((f) => form[f.key] !== saved[f.key])

    if (!form || !data) return <div style={cardStyle} className="flex justify-center py-8"><Spinner size={24} color={colors.accent} /></div>

    const set = (key: string, v: string | boolean) => {
        setForm({ ...form, [key]: v })
        if (serverErrors[key]) setServerErrors({ ...serverErrors, [key]: '' })
    }

    const save = async () => {
        if (!validation || !validation.ok) { toast.error('Corrija os campos em vermelho.'); return }
        setSaving(true)
        try {
            await callAdminApi('/api/admin/delivery-settings', validation.values as unknown as Record<string, unknown>)
            await load()
            toast.success('Regras de entrega salvas!')
        } catch (err: any) {
            if (err.fields) setServerErrors(err.fields)
            toast.error(err.message || 'Erro ao salvar')
        } finally {
            setSaving(false)
        }
    }

    const inputStyle = (bad: boolean): React.CSSProperties => ({
        background: colors.background, border: `1px solid ${bad ? '#ef4444' : colors.border}`, color: colors.textPrimary,
        borderRadius: 12, padding: '8px 12px', fontSize: 13, width: '100%',
    })

    const renderField = (f: FieldDef) => {
        const err = errors[f.key]
        const unit = UNIT[f.kind]
        if (f.kind === 'bool') {
            const on = Boolean(form[f.key])
            const locked = f.key === 'new_delivery_flow_enabled'
            return (
                <div key={f.key} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0">
                        <p className="text-xs font-bold" style={{ color: colors.textPrimary }}>{f.label}</p>
                        {(f.hint || err) && <p className="text-[11px]" style={{ color: err ? '#ef4444' : colors.textSecondary }}>{err || f.hint}</p>}
                    </div>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={f.label}
                        disabled={locked}
                        onClick={() => set(f.key, !on)}
                        className="relative w-11 h-6 rounded-full flex-shrink-0 transition-colors disabled:opacity-50"
                        style={{ background: on ? '#f97316' : '#9ca3af' }}
                    >
                        <span className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all" style={{ [on ? 'right' : 'left']: 4 }} />
                    </button>
                </div>
            )
        }
        return (
            <label key={f.key} className="flex flex-col gap-0.5">
                <span className="text-[11px] font-bold" style={{ color: colors.textPrimary }}>{f.label}</span>
                {f.kind === 'select' ? (
                    <select
                        value={f.key === 'freight_rounding_step' ? String(Number(form[f.key])) : String(form[f.key])}
                        onChange={(e) => set(f.key, e.target.value)}
                        style={inputStyle(!!err)}
                    >
                        {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                ) : (
                    <div className="relative">
                        <input
                            type="text"
                            inputMode="decimal"
                            value={String(form[f.key])}
                            placeholder={f.nullable ? 'sem limite' : ''}
                            onChange={(e) => set(f.key, e.target.value)}
                            style={{ ...inputStyle(!!err), paddingRight: unit ? 44 : 12 }}
                        />
                        {unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold" style={{ color: colors.textSecondary }}>{unit}</span>}
                    </div>
                )}
                {(err || f.hint) && <span className="text-[10px]" style={{ color: err ? '#ef4444' : colors.textSecondary }}>{err || f.hint}</span>}
            </label>
        )
    }

    const groupHasError = (id: GroupId) => FIELDS.some((f) => f.group === id && errors[f.key])

    return (
        <div className="flex flex-col gap-3">
            <div style={cardStyle}>
                <h3 className="text-base font-black" style={{ color: colors.textPrimary }}>Entregas dos pedidos (entregador iUser)</h3>
                <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                    Regras únicas do iUser: nenhuma loja define isso. O frete inicial é a Tarifa iUser (aba Tarifas). O que o fluxo de hoje já usa:
                    raio inicial, aumento do raio, tempo da rodada, aumento por rodada, teto do frete, número de rodadas e taxa da plataforma.
                    O resto fica guardado para o novo fluxo de entrega, que ainda não está ligado.
                </p>
            </div>

            {GROUPS.map((g) => {
                const isOpen = !!open[g.id] || groupHasError(g.id)
                const fields = FIELDS.filter((f) => f.group === g.id)
                return (
                    <div key={g.id} style={cardStyle}>
                        <button type="button" onClick={() => setOpen({ ...open, [g.id]: !isOpen })} className="w-full flex items-center justify-between gap-3 text-left">
                            <span>
                                <span className="block text-sm font-black" style={{ color: groupHasError(g.id) ? '#ef4444' : colors.textPrimary }}>{g.title}</span>
                                <span className="block text-[11px]" style={{ color: colors.textSecondary }}>{g.description}</span>
                            </span>
                            {isOpen ? <ChevronUp size={18} style={{ color: colors.textSecondary }} /> : <ChevronDown size={18} style={{ color: colors.textSecondary }} />}
                        </button>
                        {isOpen && (
                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                                {g.id === 'precificacao' && data.tariff && (
                                    <p className="sm:col-span-2 text-[11px] rounded-xl p-2.5" style={{ background: `${colors.border}30`, color: colors.textSecondary }}>
                                        Tarifa atual da moto (aba Tarifas): R$ {Number(data.tariff.base_fee + data.tariff.extra_fee_objeto).toFixed(2).replace('.', ',')} até {data.tariff.base_distance_km} km,
                                        depois R$ {Number(data.tariff.price_per_km).toFixed(2).replace('.', ',')} por km.
                                    </p>
                                )}
                                {fields.map(renderField)}
                            </div>
                        )}
                    </div>
                )
            })}

            <div style={cardStyle} className="flex flex-col gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={save}
                        disabled={saving || !dirty}
                        className="px-5 py-2 rounded-full text-sm font-black disabled:opacity-50"
                        style={{ background: colors.accent, color: colors.accentText }}
                    >
                        {saving ? 'Salvando...' : 'Salvar regras'}
                    </button>
                    {dirty && (
                        <button onClick={() => { setForm(saved); setServerErrors({}) }} className="px-4 py-2 rounded-full text-sm font-bold" style={{ border: `1px solid ${colors.border}`, color: colors.textSecondary }}>
                            Descartar mudanças
                        </button>
                    )}
                    {dirty && validation && !validation.ok && <span className="text-xs font-bold" style={{ color: '#ef4444' }}>Há campos para corrigir.</span>}
                </div>

                <button type="button" onClick={() => setShowHistory(!showHistory)} className="self-start text-xs font-bold underline" style={{ color: colors.textSecondary }}>
                    {showHistory ? 'Esconder histórico de alterações' : `Ver histórico de alterações (${data.audit.length})`}
                </button>
                {showHistory && (
                    <ul className="flex flex-col gap-1.5">
                        {data.audit.length === 0 && <li className="text-xs" style={{ color: colors.textSecondary }}>Nenhuma alteração registrada ainda.</li>}
                        {data.audit.map((a) => (
                            <li key={a.id} className="text-[11px]" style={{ color: colors.textSecondary }}>
                                <span className="font-bold" style={{ color: colors.textPrimary }}>{labelOfSetting(a.setting)}</span>: {formatSettingValue(a.setting, a.old_value)} → {formatSettingValue(a.setting, a.new_value)}
                                {' · '}{a.changed_by_label}{' · '}{new Date(a.changed_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}
