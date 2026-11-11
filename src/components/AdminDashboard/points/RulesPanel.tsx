// src/components/AdminDashboard/points/RulesPanel.tsx — Admin → Pontuação → Pessoas: as TAREFAS (regras de evento) e a "Nova tarefa".
// Cada tarefa é uma regra em cima de um evento do sistema (seguir, comprar, avaliar...). Várias regras do mesmo evento SOMAM: é assim que
// se faz uma campanha ("compra vale o dobro na Black Friday") ou uma penalidade (pontos negativos). Mudar vale daqui pra frente.
'use client'

import { useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { callAdminApi } from '@/lib/callAdminApi'
import { Spinner } from '@/components/Spinner'
import { ruleState, validateRule } from '@/modules/points'
import { Check, Field, STATE_STYLE, fromLocalInput, inputStyle, toLocalInput, type EventRow, type PanelProps, type RankRow, type RuleRow } from './shared'

interface Draft { label: string; points: string; daily: string; total: string; starts: string; ends: string; active: boolean }
const draftOf = (r: RuleRow): Draft => ({ label: r.label, points: String(r.points), daily: r.daily_limit == null ? '' : String(r.daily_limit), total: r.max_total == null ? '' : String(r.max_total), starts: toLocalInput(r.starts_at), ends: toLocalInput(r.ends_at), active: r.is_active })

function RuleCard({ rule, event, colors, cardStyle, reload }: { rule: RuleRow; event?: EventRow } & PanelProps) {
    const [d, setD] = useState<Draft>(() => draftOf(rule))
    const [busy, setBusy] = useState<'save' | 'del' | null>(null)
    const custom = rule.action.startsWith('t_')
    const dirty = JSON.stringify(d) !== JSON.stringify(draftOf(rule))
    const st = ruleState({ is_active: d.active, starts_at: fromLocalInput(d.starts), ends_at: fromLocalInput(d.ends) })
    const input = inputStyle(colors)

    const save = async () => {
        const msg = validateRule({ label: d.label, points: d.points, dailyLimit: d.daily, maxTotal: d.total, startsAt: fromLocalInput(d.starts), endsAt: fromLocalInput(d.ends) }, { requireLabel: true })
        if (msg) { toast.error(msg); return }
        setBusy('save')
        try {
            await callAdminApi('/api/admin/points', { action: 'save_rule', rule: rule.action, label: d.label, points: Number(d.points), daily_limit: d.daily, max_total: d.total, starts_at: fromLocalInput(d.starts), ends_at: fromLocalInput(d.ends), is_active: d.active })
            toast.success('Tarefa salva!')
            await reload()
        } catch (e: any) { toast.error(e.message || 'Erro ao salvar') }
        setBusy(null)
    }
    const remove = async () => {
        if (!window.confirm('Apagar esta tarefa? (só é possível porque ela nunca rendeu pontos)')) return
        setBusy('del')
        try { await callAdminApi('/api/admin/points', { action: 'delete_rule', rule: rule.action }); toast.success('Tarefa apagada'); await reload() }
        catch (e: any) { toast.error(e.message || 'Erro ao apagar') }
        setBusy(null)
    }

    return (
        <div style={cardStyle} className="space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-black" style={{ color: colors.textPrimary }}>{rule.label}</p>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: STATE_STYLE[st].bg, color: STATE_STYLE[st].fg }}>{st}</span>
                        {custom && <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: '#f9731622', color: '#c2410c' }}>criada por você</span>}
                    </div>
                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                        Evento: {event?.label || rule.event}{rule.description ? ` — ${rule.description}` : ''} · {rule.times === 0 ? 'ainda não rendeu' : `rendeu ${rule.times}× (${rule.given.toLocaleString('pt-BR')} pts)`}
                    </p>
                </div>
                <Check colors={colors} checked={d.active} onChange={(v) => setD({ ...d, active: v })}>Valendo</Check>
            </div>
            {custom && (
                <Field colors={colors} label="Nome da tarefa"><input value={d.label} maxLength={80} onChange={(e) => setD({ ...d, label: e.target.value })} style={input} /></Field>
            )}
            <div className="grid grid-cols-3 gap-3">
                <Field colors={colors} label="Pontos por vez" hint="negativo = penalidade"><input type="number" value={d.points} onChange={(e) => setD({ ...d, points: e.target.value })} style={input} /></Field>
                <Field colors={colors} label="Máximo por dia" hint="vazio = sem limite"><input type="number" min={1} value={d.daily} onChange={(e) => setD({ ...d, daily: e.target.value })} style={input} /></Field>
                <Field colors={colors} label="Máximo no total" hint="por pessoa"><input type="number" min={1} value={d.total} onChange={(e) => setD({ ...d, total: e.target.value })} style={input} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <Field colors={colors} label="Começa em (opcional)"><input type="datetime-local" value={d.starts} onChange={(e) => setD({ ...d, starts: e.target.value })} style={input} /></Field>
                <Field colors={colors} label="Termina em (opcional)"><input type="datetime-local" value={d.ends} onChange={(e) => setD({ ...d, ends: e.target.value })} style={input} /></Field>
            </div>
            <div className="flex items-center gap-2">
                <button onClick={save} disabled={busy !== null || !dirty} className="flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-black text-white disabled:opacity-50" style={{ background: colors.accent }}>
                    {busy === 'save' ? <Spinner size={14} color="#fff" /> : <Save size={14} />} Salvar
                </button>
                {custom && rule.times === 0 && (
                    <button onClick={remove} disabled={busy !== null} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-black disabled:opacity-50" style={{ background: '#dc262618', color: '#b91c1c' }}>
                        {busy === 'del' ? <Spinner size={14} color="#b91c1c" /> : <Trash2 size={14} />} Apagar
                    </button>
                )}
            </div>
        </div>
    )
}

function NewRule({ events, colors, cardStyle, reload }: { events: EventRow[] } & PanelProps) {
    const [open, setOpen] = useState(false)
    const [event, setEvent] = useState(events[0]?.event || '')
    const [label, setLabel] = useState('')
    const [points, setPoints] = useState('10')
    const [daily, setDaily] = useState('')
    const [total, setTotal] = useState('')
    const [starts, setStarts] = useState('')
    const [ends, setEnds] = useState('')
    const [busy, setBusy] = useState(false)
    const input = inputStyle(colors)
    const ev = events.find((e) => e.event === event)

    const create = async () => {
        const msg = validateRule({ label, points, dailyLimit: daily, maxTotal: total, startsAt: fromLocalInput(starts), endsAt: fromLocalInput(ends) }, { requireLabel: true })
        if (msg) { toast.error(msg); return }
        setBusy(true)
        try {
            await callAdminApi('/api/admin/points', { action: 'new_rule', event, label, points: Number(points), daily_limit: daily, max_total: total, starts_at: fromLocalInput(starts), ends_at: fromLocalInput(ends), is_active: true })
            toast.success('Tarefa criada!')
            setLabel(''); setPoints('10'); setDaily(''); setTotal(''); setStarts(''); setEnds(''); setOpen(false)
            await reload()
        } catch (e: any) { toast.error(e.message || 'Erro ao criar') }
        setBusy(false)
    }

    if (!open) {
        return (
            <button onClick={() => setOpen(true)} className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-black" style={{ border: `2px dashed ${colors.border}`, color: colors.textPrimary }}>
                <Plus size={16} /> Nova tarefa
            </button>
        )
    }
    return (
        <div style={cardStyle} className="space-y-3">
            <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Nova tarefa</p>
            <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                Escolha o que a pessoa faz (os eventos que o iUser já reconhece) e quanto vale. Se já existe uma tarefa para o mesmo evento, a nova <b>soma</b> com ela — serve para campanhas
                (“compra vale mais até domingo”) e para penalidades (pontos negativos).
            </p>
            <Field colors={colors} label="O que a pessoa faz" hint={ev?.description || undefined}>
                <select value={event} onChange={(e) => setEvent(e.target.value)} style={input}>
                    {events.map((e) => <option key={e.event} value={e.event}>{e.label}</option>)}
                </select>
            </Field>
            <Field colors={colors} label="Nome da tarefa (a pessoa vê)"><input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Compra na Black Friday" style={input} /></Field>
            <div className="grid grid-cols-3 gap-3">
                <Field colors={colors} label="Pontos por vez"><input type="number" value={points} onChange={(e) => setPoints(e.target.value)} style={input} /></Field>
                <Field colors={colors} label="Máximo por dia"><input type="number" min={1} value={daily} onChange={(e) => setDaily(e.target.value)} style={input} /></Field>
                <Field colors={colors} label="Máximo no total"><input type="number" min={1} value={total} onChange={(e) => setTotal(e.target.value)} style={input} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <Field colors={colors} label="Começa em (opcional)"><input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} style={input} /></Field>
                <Field colors={colors} label="Termina em (opcional)"><input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} style={input} /></Field>
            </div>
            <div className="flex items-center gap-2">
                <button onClick={create} disabled={busy} className="flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-black text-white disabled:opacity-50" style={{ background: colors.accent }}>
                    {busy ? <Spinner size={14} color="#fff" /> : <Plus size={14} />} Criar tarefa
                </button>
                <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-full text-xs font-black" style={{ background: `${colors.border}55`, color: colors.textPrimary }}>Cancelar</button>
            </div>
        </div>
    )
}

export default function RulesPanel({ events, rules, ranking, colors, cardStyle, reload }: { events: EventRow[]; rules: RuleRow[]; ranking: RankRow[] } & PanelProps) {
    const evOf = new Map(events.map((e) => [e.event, e]))
    return (
        <div className="space-y-4">
            <div style={cardStyle} className="space-y-1">
                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Tarefas das pessoas</p>
                <p className="text-xs" style={{ color: colors.textSecondary }}>
                    Cada tarefa vale uma quantidade de pontos quando a pessoa a faz. O limite por dia e o total evitam ganhar ponto em série. Mudar um valor vale a partir de agora:
                    o que já foi ganho fica com o valor da época. Tarefas novas de compra e avaliação nascem <b>desligadas</b> — ligue quando quiser que contem.
                </p>
            </div>
            {rules.map((r) => <RuleCard key={r.action} rule={r} event={evOf.get(r.event)} colors={colors} cardStyle={cardStyle} reload={reload} />)}
            <NewRule events={events} colors={colors} cardStyle={cardStyle} reload={reload} />
            <div style={cardStyle} className="space-y-2">
                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Quem mais tem pontos (livro-caixa das pessoas)</p>
                {ranking.length === 0 ? <p className="text-xs" style={{ color: colors.textSecondary }}>Ainda ninguém pontuou.</p> : ranking.map((row) => (
                    <div key={row.profile_id} className="flex items-center justify-between gap-3 text-xs">
                        <span style={{ color: colors.textPrimary }}><b>{row.rank}.</b> {row.name || 'Perfil'} {row.slug && <span style={{ color: colors.textSecondary }}>@{row.slug}</span>}</span>
                        <span className="font-black" style={{ color: '#f97316' }}>{row.total.toLocaleString('pt-BR')} pts</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
