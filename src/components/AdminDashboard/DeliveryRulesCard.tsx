// src/components/AdminDashboard/DeliveryRulesCard.tsx
//
// Admin → Entregas → "Prazos e limites da operação" (18/11/2026): um cartão por grupo (ciclo do pedido, pedido esperando entregador, caixa do entregador,
// liberação do dinheiro e da maquininha, Pós-pago). Cada grupo salva sozinho; a mesma validação roda aqui, na rota e no banco. Antes isso só mudava por SQL.
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { ThemeColors } from '@/app/contexts/theme'
import { toast } from '@/lib/toast'
import { callAdminApi } from '@/lib/callAdminApi'
import { Spinner } from '@/components/Spinner'
import { parseField, RULE_GROUPS, rulesDiff, validateRules, type RuleField, type RulesGroup, type RulesValues } from '@/modules/delivery-rules'

type All = Record<RulesGroup, RulesValues>
const show = (f: RuleField, v: number | boolean | null | undefined) => (v == null ? '' : f.kind === 'money' ? Number(v).toFixed(2).replace('.', ',') : String(v).replace('.', ','))

export default function DeliveryRulesCard({ cardStyle, colors }: { cardStyle: React.CSSProperties; colors: ThemeColors }) {
    const [saved, setSaved] = useState<All | null>(null)
    const [text, setText] = useState<Record<string, string | boolean>>({})
    const [open, setOpen] = useState<RulesGroup | null>(null)
    const [busy, setBusy] = useState<RulesGroup | null>(null)

    const fill = (rules: All) => {
        setSaved(rules)
        const t: Record<string, string | boolean> = {}
        for (const g of RULE_GROUPS) for (const f of g.fields) t[`${g.id}.${f.key}`] = f.kind === 'bool' ? !!rules[g.id]?.[f.key] : show(f, rules[g.id]?.[f.key] as number | null)
        setText(t)
    }
    const load = useCallback(async () => {
        const r = await callAdminApi<{ rules: All }>('/api/admin/delivery-rules', { action: 'load' })
        fill(r.rules)
    }, [])
    useEffect(() => { load().catch((e) => toast.error(e.message || 'Erro ao carregar')) }, [load])

    const values = useMemo(() => {
        const out = {} as All
        for (const g of RULE_GROUPS) {
            out[g.id] = {}
            for (const f of g.fields) out[g.id][f.key] = parseField(f, text[`${g.id}.${f.key}`] ?? (f.kind === 'bool' ? false : '')) as number | boolean | null
        }
        return out
    }, [text])

    if (!saved) return <div style={cardStyle} className="flex justify-center py-6"><Spinner size={22} color={colors.accent} /></div>

    const save = async (g: RulesGroup) => {
        const patch = rulesDiff(g, saved[g], values[g])
        if (!Object.keys(patch).length) return
        setBusy(g)
        try {
            const r = await callAdminApi<{ rules: All; changed: number }>('/api/admin/delivery-rules', { action: 'update', group: g, patch })
            fill(r.rules)
            toast.success(`${r.changed} ${r.changed === 1 ? 'valor salvo' : 'valores salvos'}`)
        } catch (e: any) { toast.error(e.message || 'Não foi possível salvar') }
        finally { setBusy(null) }
    }

    return (
        <div className="flex flex-col gap-3">
            <div style={cardStyle}>
                <h3 className="text-base font-black" style={{ color: colors.textPrimary }}>Prazos e limites da operação</h3>
                <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Quanto tempo a loja tem para aceitar, quando o pedido sem entregador é cancelado, quanto dinheiro o entregador pode segurar, quando o entregador novo passa a levar dinheiro e o teto do Pós-pago. Vale na hora, para todas as lojas e entregadores.</p>
            </div>
            {RULE_GROUPS.map((g) => {
                const isOpen = open === g.id
                const errors = validateRules(g.id, values[g.id])
                const dirty = Object.keys(rulesDiff(g.id, saved[g.id], values[g.id])).length > 0
                return (
                    <div key={g.id} style={cardStyle}>
                        <button type="button" onClick={() => setOpen(isOpen ? null : g.id)} className="w-full flex items-center justify-between gap-3 text-left">
                            <span>
                                <span className="block text-sm font-black" style={{ color: colors.textPrimary }}>{g.title}</span>
                                <span className="block text-[11px]" style={{ color: colors.textSecondary }}>{g.desc}</span>
                            </span>
                            {isOpen ? <ChevronUp size={18} style={{ color: colors.textSecondary }} /> : <ChevronDown size={18} style={{ color: colors.textSecondary }} />}
                        </button>
                        {isOpen && (
                            <>
                                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                                    {g.fields.map((f) => {
                                        const k = `${g.id}.${f.key}`
                                        const err = errors[f.key]
                                        if (f.kind === 'bool') return (
                                            <label key={k} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: `${colors.border}25` }}>
                                                <span className="text-[13px] font-bold" style={{ color: colors.textPrimary }}>{f.label}</span>
                                                <input type="checkbox" checked={!!text[k]} onChange={(e) => setText({ ...text, [k]: e.target.checked })} className="w-5 h-5 accent-orange-500" />
                                            </label>
                                        )
                                        return (
                                            <label key={k} className="flex flex-col gap-1">
                                                <span className="text-[12px] font-bold" style={{ color: err ? '#ef4444' : colors.textPrimary }}>{f.label}{f.unit ? ` (${f.unit})` : ''}</span>
                                                <input inputMode="decimal" value={String(text[k] ?? '')} onChange={(e) => setText({ ...text, [k]: e.target.value })} placeholder={f.nullable ? 'vazio = sem limite' : ''}
                                                    className="h-10 px-3 rounded-xl text-sm" style={{ background: `${colors.border}25`, color: colors.textPrimary, border: `1px solid ${err ? '#ef4444' : colors.border}` }} />
                                                {(err || f.help) && <span className="text-[11px]" style={{ color: err ? '#ef4444' : colors.textSecondary }}>{err || f.help}</span>}
                                            </label>
                                        )
                                    })}
                                </div>
                                <div className="mt-3 flex items-center gap-2">
                                    <button onClick={() => save(g.id)} disabled={!dirty || Object.keys(errors).length > 0 || busy === g.id} className="px-5 py-2 rounded-full text-sm font-black disabled:opacity-50" style={{ background: colors.accent, color: colors.accentText }}>{busy === g.id ? 'Salvando...' : 'Salvar'}</button>
                                    {dirty && <button onClick={() => fill(saved)} className="px-4 py-2 rounded-full text-sm font-bold" style={{ border: `1px solid ${colors.border}`, color: colors.textSecondary }}>Descartar</button>}
                                </div>
                            </>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
