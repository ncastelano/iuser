// src/components/AdminDashboard/GrantsSection.tsx
//
// Admin → Concedidos: dar um plano (ex: Pré-pago) a alguém por quanto tempo quiser, sem cobrar, e
// acompanhar tudo que já foi concedido: quem recebeu, quem concedeu, quando começa/acaba, quanto falta,
// o motivo. Dá pra estender o prazo ou encerrar uma concessão. É receita zero: concedido não é venda.
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { callAdminApi } from '@/lib/callAdminApi'
import { Spinner } from '@/components/Spinner'
import ProfilePicker from './ProfilePicker'
import type { ThemeColors } from '@/app/contexts/theme'

interface Grant {
    id: string
    status: 'pending' | 'active' | 'past_due' | 'canceled'
    active: boolean
    source: 'admin_grant' | 'leader_grant' | 'code' | 'free_trial'
    planCode: string
    planName: string
    personName: string | null
    personSlug: string | null
    startsAt: string | null
    endsAt: string | null
    createdAt: string
    grantedByName: string | null
    grantedBySlug: string | null
    reason: string | null
}

interface ListResponse {
    grants: Grant[]
    activeCount: number
    plans: { code: string; name: string; count: number }[]
    grantable: { code: string; name: string }[]
}

const SOURCE_LABEL: Record<Grant['source'], string> = {
    admin_grant: 'Concedido pelo admin',
    leader_grant: 'Concedido por liderança',
    code: 'Código promocional',
    free_trial: 'Brinde (resgate do usuário)',
}

const PRESET_DAYS = [30, 60, 90, 180, 365]

// Dias do começo da concessão (agora, ou a data de início escolhida) até o fim do ano (31/12, fim do dia)
function daysUntilEndOfYear(from?: string): number {
    const start = from ? new Date(from) : new Date()
    // 31/12 23:59:59 no horário de Brasília (= 01/01 02:59:59 UTC), igual ao "Motorista Beta" dos Planos
    const end = new Date(Date.UTC(start.getUTCFullYear(), 11, 32, 2, 59, 59))
    return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000))
}
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—')
const daysLeft = (iso: string | null) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)) : null)

type Filter = 'ativos' | 'encerrados' | 'todos'

export default function GrantsSection({ cardStyle, colors }: { cardStyle: React.CSSProperties; colors: ThemeColors }) {
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState<ListResponse | null>(null)
    const [filter, setFilter] = useState<Filter>('ativos')
    const [query, setQuery] = useState('')

    // formulário
    const [slug, setSlug] = useState('')
    const [planCode, setPlanCode] = useState('')
    const [days, setDays] = useState('30')
    const [startsAt, setStartsAt] = useState('')
    const [reason, setReason] = useState('')
    const [granting, setGranting] = useState(false)
    const [busyId, setBusyId] = useState<string | null>(null)
    // Qual concessão está com as opções de tempo abertas (clica em Estender → aparecem os atalhos)
    const [extendOpenId, setExtendOpenId] = useState<string | null>(null)

    const load = useCallback(async () => {
        try {
            const res = await callAdminApi<ListResponse>('/api/admin/grants/list')
            setData(res)
            setPlanCode((prev) => (res.grantable.some((p) => p.code === prev) ? prev : (res.grantable[0]?.code || '')))
        } catch (err: any) {
            toast.error(err.message || 'Erro ao carregar as concessões')
        }
        setLoading(false)
    }, [])
    useEffect(() => { load() }, [load])

    const grant = async () => {
        const n = Math.round(Number(days))
        if (!slug.trim() || !planCode || !Number.isFinite(n) || n < 1) { toast.error('Informe o @, o plano e os dias'); return }
        setGranting(true)
        try {
            await callAdminApi('/api/admin/plans/grant', {
                profileSlug: slug.trim(),
                planCode,
                days: n,
                reason: reason.trim() || null,
                startsAt: startsAt ? new Date(startsAt).toISOString() : null,
            })
            toast.success(`Plano concedido a @${slug.trim().replace(/^@/, '')} por ${n} dias`)
            setSlug(''); setReason(''); setStartsAt('')
            await load()
        } catch (err: any) {
            toast.error(err.message || 'Erro ao conceder')
        } finally {
            setGranting(false)
        }
    }

    const extend = async (g: Grant, n: number, label: string) => {
        setBusyId(g.id)
        try {
            await callAdminApi('/api/admin/grants/extend', { subscriptionId: g.id, days: n })
            toast.success(`Prazo estendido: ${label}`)
            setExtendOpenId(null)
            await load()
        } catch (err: any) { toast.error(err.message || 'Erro ao estender') }
        setBusyId(null)
    }

    const revoke = async (g: Grant) => {
        if (!window.confirm(`Encerrar agora o ${g.planName} de ${g.personName || '@' + g.personSlug}?`)) return
        setBusyId(g.id)
        try {
            await callAdminApi('/api/admin/grants/revoke', { subscriptionId: g.id })
            toast.success('Concessão encerrada')
            await load()
        } catch (err: any) { toast.error(err.message || 'Erro ao encerrar') }
        setBusyId(null)
    }

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase().replace(/^@/, '')
        return (data?.grants || []).filter((g) => {
            if (filter === 'ativos' && !g.active) return false
            if (filter === 'encerrados' && g.active) return false
            if (!q) return true
            return [g.personName, g.personSlug, g.planName, g.grantedByName, g.grantedBySlug].some((v) => (v || '').toLowerCase().includes(q))
        })
    }, [data, filter, query])

    if (loading) return <div style={cardStyle} className="flex justify-center py-8"><Spinner size={24} color={colors.accent} /></div>
    if (!data) return null

    const input: React.CSSProperties = { background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary, borderRadius: 12, padding: '8px 12px', fontSize: 13 }
    const label = (t: string) => <span className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>{t}</span>

    return (
        <div className="space-y-5">
            <div style={cardStyle} className="space-y-2">
                <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Concedido de graça (não é receita)</p>
                <p className="text-2xl font-black" style={{ color: colors.textPrimary }}>{data.activeCount}</p>
                <div className="flex flex-wrap gap-2">
                    {data.plans.map((p) => (
                        <span key={p.code} className="text-[11px] font-bold px-3 py-1.5 rounded-full" style={{ background: `${colors.border}30`, color: colors.textSecondary }}>
                            {p.name}: {p.count}
                        </span>
                    ))}
                    {data.plans.length === 0 && <span className="text-xs" style={{ color: colors.textSecondary }}>Nenhum plano concedido de graça ativo.</span>}
                </div>
            </div>

            <div style={cardStyle} className="space-y-3">
                <div>
                    <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Conceder um plano</p>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                        A pessoa fica com o plano ativo pelo tempo escolhido, sem pagar e sem passar pela Asaas. Se ela já tem esse plano concedido, o prazo é renovado.
                    </p>
                </div>
                {data.grantable.length === 0 ? (
                    <p className="text-xs font-bold" style={{ color: '#ef4444' }}>Nenhum plano está liberado pra concessão. Marque o plano como concedível em Planos.</p>
                ) : (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="flex flex-col gap-0.5">{label('Perfil (digite o nome ou o @)')}<ProfilePicker value={slug} onChange={setSlug} colors={colors} /></div>
                            <div className="flex flex-col gap-0.5">
                                {label('Plano')}
                                <select value={planCode} onChange={(e) => setPlanCode(e.target.value)} style={input}>
                                    {data.grantable.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="flex flex-col gap-1">
                            {label('Por quanto tempo (dias)')}
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    onClick={() => setDays(String(daysUntilEndOfYear(startsAt || undefined)))}
                                    className="px-3 py-1.5 rounded-full text-[11px] font-black"
                                    style={Number(days) === daysUntilEndOfYear(startsAt || undefined) && !PRESET_DAYS.includes(Number(days))
                                        ? { background: colors.accent, color: '#fff' }
                                        : { border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                    title="Até 31/12 deste ano"
                                >
                                    Até o fim do ano
                                </button>
                                {PRESET_DAYS.map((d) => (
                                    <button
                                        key={d}
                                        onClick={() => setDays(String(d))}
                                        className="px-3 py-1.5 rounded-full text-[11px] font-black"
                                        style={Number(days) === d ? { background: colors.accent, color: '#fff' } : { border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                    >
                                        {d === 365 ? '1 ano' : `${d} dias`}
                                    </button>
                                ))}
                                <input type="text" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} style={{ ...input, width: 90 }} aria-label="Dias" />
                                <span className="text-[11px]" style={{ color: colors.textSecondary }}>dias</span>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="flex flex-col gap-0.5">{label('Começa em (opcional — vazio = agora)')}<input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} style={input} /></div>
                            <div className="flex flex-col gap-0.5">{label('Motivo (opcional, fica registrado)')}<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex: parceiro, cortesia, teste" maxLength={300} style={input} /></div>
                        </div>
                        <button
                            onClick={grant}
                            disabled={granting || !slug.trim() || !planCode}
                            className="px-6 py-2.5 rounded-full text-xs font-black text-white disabled:opacity-50"
                            style={{ background: colors.accent }}
                        >
                            {granting ? <Spinner size={14} color="#fff" /> : 'Conceder'}
                        </button>
                    </>
                )}
            </div>

            <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                    {(['ativos', 'encerrados', 'todos'] as Filter[]).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className="px-3.5 py-1.5 rounded-full text-[11px] font-black capitalize"
                            style={filter === f ? { background: colors.accent, color: '#fff' } : { border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                        >
                            {f}
                        </button>
                    ))}
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por pessoa, plano ou quem concedeu" style={{ ...input, flex: 1, minWidth: 180 }} />
                </div>

                {visible.length === 0 ? (
                    <div className="text-sm" style={{ ...cardStyle, color: colors.textSecondary }}>Nenhuma concessão {filter === 'todos' ? '' : filter} {query ? 'com essa busca' : 'por aqui'}.</div>
                ) : visible.map((g) => {
                    const left = daysLeft(g.endsAt)
                    return (
                        <div key={g.id} style={cardStyle} className="space-y-2">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>
                                        {g.personName || (g.personSlug ? `@${g.personSlug}` : 'Pessoa')}
                                        {g.personSlug && g.personName ? <span className="font-normal" style={{ color: colors.textSecondary }}> @{g.personSlug}</span> : null}
                                        {' · '}{g.planName}
                                    </p>
                                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                                        {SOURCE_LABEL[g.source]}
                                        {g.grantedByName || g.grantedBySlug ? ` · por ${g.grantedByName || '@' + g.grantedBySlug}` : ''}
                                        {' · '}concedido em {fmt(g.createdAt)}
                                    </p>
                                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                                        {g.startsAt && new Date(g.startsAt).getTime() > Date.now() ? `Começa em ${fmt(g.startsAt)} · ` : ''}
                                        até {fmt(g.endsAt)}
                                    </p>
                                    {g.reason && <p className="text-[11px] italic mt-0.5" style={{ color: colors.textSecondary }}>“{g.reason}”</p>}
                                </div>
                                <span
                                    className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full flex-shrink-0"
                                    style={g.active ? { background: '#22c55e20', color: '#16a34a' } : { background: `${colors.border}40`, color: colors.textSecondary }}
                                >
                                    {g.active ? (left != null ? `faltam ${left} ${left === 1 ? 'dia' : 'dias'}` : 'ativa') : 'encerrada'}
                                </span>
                            </div>
                            {g.active && g.source !== 'free_trial' && (
                                <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            onClick={() => setExtendOpenId(extendOpenId === g.id ? null : g.id)}
                                            disabled={busyId !== null}
                                            className="px-3.5 py-1.5 rounded-full text-[11px] font-black text-white disabled:opacity-50"
                                            style={{ background: colors.accent }}
                                        >
                                            {extendOpenId === g.id ? 'Fechar' : 'Estender'}
                                        </button>
                                        <button onClick={() => revoke(g)} disabled={busyId !== null} className="px-3.5 py-1.5 rounded-full text-[11px] font-black disabled:opacity-50" style={{ border: '1px solid #ef444460', color: '#ef4444' }}>
                                            Encerrar agora
                                        </button>
                                    </div>
                                    {extendOpenId === g.id && (() => {
                                        // "Até o fim do ano" parte do fim atual da concessão (ou de agora, se já acabou)
                                        const base = Math.max(Date.now(), g.endsAt ? new Date(g.endsAt).getTime() : 0)
                                        const toYearEnd = Math.ceil((Date.UTC(new Date(base).getUTCFullYear(), 11, 32, 2, 59, 59) - base) / 86400000)
                                        const options: { n: number; label: string }[] = [
                                            ...(toYearEnd >= 1 ? [{ n: toYearEnd, label: 'Até o fim do ano' }] : []),
                                            ...PRESET_DAYS.map((d) => ({ n: d, label: d === 365 ? '+ 1 ano' : `+ ${d} dias` })),
                                        ]
                                        return (
                                            <div className="flex flex-wrap items-center gap-2 rounded-xl p-2.5" style={{ background: `${colors.border}25` }}>
                                                <span className="text-[10px] font-bold w-full" style={{ color: colors.textSecondary }}>Somar quanto tempo ao prazo atual?</span>
                                                {options.map((o) => (
                                                    <button
                                                        key={o.label}
                                                        onClick={() => extend(g, o.n, o.label.replace('+ ', '+'))}
                                                        disabled={busyId !== null}
                                                        className="px-3 py-1.5 rounded-full text-[11px] font-black disabled:opacity-50"
                                                        style={{ border: `1px solid ${colors.accent}`, color: colors.accent }}
                                                    >
                                                        {busyId === g.id ? <Spinner size={12} /> : o.label}
                                                    </button>
                                                ))}
                                            </div>
                                        )
                                    })()}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
