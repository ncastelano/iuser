// src/components/AdminDashboard/UploadsSection.tsx
//
// Admin → Uploads (Camada 5 do controle de uploads, docs/CONTROLE-DE-UPLOADS.md): quanto cada tipo de envio ocupa, o que as pessoas enviaram nas últimas 24 h, quem está sendo barrado,
// os limites de cada tipo (editáveis), os maiores consumidores (com bloqueio), os bloqueios ativos e o histórico de mudanças. O interruptor "envio só com autorização" também é daqui.
// Toda mudança pede confirmação antes. As regras e a validação são do módulo `uploads` (as mesmas da rota /api/admin/uploads e as CHECKs do banco).
'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/lib/toast'
import { callAdminApi } from '@/lib/callAdminApi'
import { Spinner } from '@/components/Spinner'
import type { ThemeColors } from '@/app/contexts/theme'
import {
    ABUSE_CODES, BLOCK_DURATIONS, FIELD_LABEL, LIMIT_FIELDS, denialLabel, formToPatch, formatBytes, kindToForm, limitText, meterPct, meterTone,
    CLEANUP_LABEL, candidateStatus, cleanupFormToPatch, cleanupToForm, fileLabel, runSummary,
    type CleanupErrors, type CleanupField, type CleanupForm, type CleanupSettings, type RunRow,
    type KindForm, type KindLimits, type LimitErrors, type LimitField, type Meter,
} from '@/modules/uploads'
import type { CleanupResult } from '@/lib/uploadCleanup'

interface KindRow extends KindLimits {
    kind: string; label: string; bucket: string; provider: string; owner_folder: boolean
    files: number; bytes: number; owners: number; grants_24h: number; bytes_24h: number; denials_24h: number
}
interface Totals { files: number; bytes: number; owners: number; unknown_owner_files: number; grants_1h: number; grants_24h: number; denials_24h: number; blocks_active: number }
interface Owner { profile_id: string; name: string | null; slug: string | null; files: number; bytes: number; files_24h: number; bytes_24h: number; blocked: boolean }
interface Denial { profile_id: string; name: string | null; slug: string | null; kind: string | null; code: string; hits: number; last_at: string; blocked: boolean }
interface BlockRow { id: string; profile_id: string | null; profile_label: string | null; kind: string | null; reason: string | null; blocked_until: string | null; created_at: string; created_by_label: string }
interface AuditRow { id: string; scope: string; setting: string; old_value: unknown; new_value: unknown; changed_at: string; changed_by_label: string; target_profile?: string | null; target_kind?: string | null }
interface Candidate { id: string; kind: string; kind_label: string; bucket: string; key: string; bytes: number; created_at: string; orphan_since: string | null; keep: boolean; due: boolean; days_left: number | null }
interface CleanupOverview {
    settings: CleanupSettings; eligible_kinds: string[]; protected_kinds: string[]
    counts: { orphans: number; orphan_bytes: number; due: number; kept: number; deleted_total: number; freed_bytes: number }
    runs: RunRow[]; candidates: Candidate[]
}
interface R2Info { configured: boolean; bucket: string | null; publicBase: string | null; problems: string[] }
interface R2Check { ok: boolean; steps: { step: string; ok: boolean; detail: string; ms: number }[]; problems?: string[]; bucket?: string }
interface Loaded { r2: R2Info | null; overview: { enforced: boolean; totals: Totals; kinds: KindRow[] }; top: Owner[]; denials: Denial[]; blocks: BlockRow[]; audit: AuditRow[]; meters: Meter[]; cleanup: CleanupOverview | null }

const ORANGE = '#f97316'
const who = (p: { name: string | null; slug: string | null }) => (p.slug ? `@${p.slug}` : p.name || 'Pessoa')
const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const plural = (n: number, one: string, many: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`

function auditText(a: AuditRow, kinds: KindRow[]): string {
    const kindLabel = (id: string) => kinds.find((k) => k.kind === id)?.label || id
    if (a.scope === 'upload_cleanup') return `Limpeza — ${a.new_value === true ? 'arquivo marcado para ficar para sempre' : 'arquivo volta a poder ser limpo'}: ${fileLabel(a.setting)}`
    if (a.scope === 'upload_settings' && a.setting.startsWith('cleanup_')) {
        const f = a.setting === 'cleanup_enabled' ? 'enabled' : a.setting.replace('cleanup_', '')
        if (f === 'enabled') return `Limpeza de arquivos sem uso — apagar de verdade: ${a.new_value === true ? 'LIGADO' : 'DESLIGADO'}`
        return `Limpeza — ${CLEANUP_LABEL[f as CleanupField] || a.setting}: ${String(a.old_value)} → ${String(a.new_value)}`
    }
    if (a.scope === 'upload_settings') return `Envio só com autorização: ${a.new_value === true ? 'LIGADO' : 'DESLIGADO'}`
    if (a.scope === 'upload_blocks') {
        const nv = a.new_value as { block?: string; hours?: number | null; reason?: string } | null
        const alvo = `${a.target_profile || 'todas as pessoas'} · ${a.target_kind ? kindLabel(a.target_kind) : 'todos os tipos'}`
        if (nv?.block) return `Bloqueio criado (${alvo})${nv.hours ? ` por ${nv.hours} h` : ' até liberar'}${nv.reason ? ` — ${nv.reason}` : ''}`
        return `Bloqueio levantado (${alvo})`
    }
    const [kind, field] = a.setting.split('.')
    const f = field as LimitField
    if (!(LIMIT_FIELDS as readonly string[]).includes(f)) return a.setting
    return `${kindLabel(kind)} — ${FIELD_LABEL[f]}: ${limitText(f, a.old_value)} → ${limitText(f, a.new_value)}`
}

export default function UploadsSection({ cardStyle, colors }: { cardStyle: React.CSSProperties; colors: ThemeColors }) {
    const [data, setData] = useState<Loaded | null>(null)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [confirmSwitch, setConfirmSwitch] = useState(false)
    const [topKind, setTopKind] = useState<string | null>(null)
    const [top, setTop] = useState<Owner[]>([])
    const [editing, setEditing] = useState<{ kind: string; form: KindForm; errors: LimitErrors; review: Partial<KindLimits> | null } | null>(null)
    const [block, setBlock] = useState<{ profile_id: string; label: string; kind: string; hours: string; reason: string } | null>(null)
    const [liftId, setLiftId] = useState<string | null>(null)
    const [auditAll, setAuditAll] = useState(false)
    const [cleanForm, setCleanForm] = useState<{ form: CleanupForm; errors: CleanupErrors } | null>(null)
    const [cleanConfirm, setCleanConfirm] = useState<'switch' | 'run' | null>(null)
    const [cleanResult, setCleanResult] = useState<CleanupResult | null>(null)
    const [r2Check, setR2Check] = useState<R2Check | null>(null)

    const load = useCallback(async () => {
        try { const r = await callAdminApi<Loaded>('/api/admin/uploads', { action: 'load' }); setData(r); setTop(r.top); setTopKind(null) }
        catch (e: any) { toast.error(e?.message || 'Erro ao carregar') } finally { setLoading(false) }
    }, [])
    useEffect(() => { load() }, [load])

    const run = async (body: Record<string, unknown>, ok: string, after?: () => void) => {
        setBusy(true)
        try { await callAdminApi('/api/admin/uploads', body); toast.success(ok); after?.(); await load() }
        catch (e: any) { toast.error(e?.message || 'Não deu certo.') } finally { setBusy(false) }
    }
    const runCleanup = async (dry: boolean) => {
        setBusy(true)
        try {
            const r = await callAdminApi<{ result: CleanupResult }>('/api/admin/uploads', { action: 'cleanup_run', dry })
            setCleanResult(r.result); setCleanConfirm(null)
            if (!r.result.ok) toast.error('A rodada terminou com problemas. Veja o resumo.')
            else toast.success(r.result.dryRun ? 'Simulação feita. Nada foi apagado.' : `Limpeza feita: ${r.result.deleted} apagados.`)
            await load()
        } catch (e: any) { toast.error(e?.message || 'Não deu certo.') } finally { setBusy(false) }
    }
    const checkR2 = async () => {
        setBusy(true); setR2Check(null)
        try { setR2Check(await callAdminApi<R2Check>('/api/admin/uploads', { action: 'r2_check' })) }
        catch (e: any) { toast.error(e?.message || 'Não deu certo.') } finally { setBusy(false) }
    }
    const showTop = async (kind: string | null) => {
        setTopKind(kind)
        try { const r = await callAdminApi<{ top: Owner[] }>('/api/admin/uploads', { action: 'top', kind }); setTop(r.top) } catch (e: any) { toast.error(e?.message || 'Erro ao carregar') }
    }

    if (loading) return <div className="p-8 flex justify-center"><Spinner size={22} /></div>
    if (!data) return <div style={cardStyle} className="text-sm" ><span style={{ color: colors.textSecondary }}>Não foi possível carregar os dados de uploads.</span></div>

    const { overview, denials, blocks, audit, meters } = data
    const kinds = overview.kinds
    const t = overview.totals
    const soft = `${colors.border}40`
    const kindName = (id: string | null) => (id ? kinds.find((k) => k.kind === id)?.label || id : 'Todos os tipos')
    const pill = 'h-10 rounded-full text-[12px] font-black active:scale-95 disabled:opacity-50 px-4'
    const chip = (text: string, tone?: string) => <span className="px-2 py-0.5 rounded-full text-[10px] font-black" style={{ background: tone ? `${tone}22` : soft, color: tone || colors.textSecondary }}>{text}</span>

    const startEdit = (k: KindRow) => setEditing({ kind: k.kind, form: kindToForm(k), errors: {}, review: null })
    const review = () => {
        if (!editing) return
        const k = kinds.find((x) => x.kind === editing.kind)!
        const r = formToPatch(editing.form, k)
        if (!r.ok) { setEditing({ ...editing, errors: r.errors, review: null }); return }
        if (Object.keys(r.patch).length === 0) { toast.info('Nada mudou.'); setEditing(null); return }
        setEditing({ ...editing, errors: {}, review: r.patch })
    }
    const setForm = (patch: Partial<KindForm>) => editing && setEditing({ ...editing, form: { ...editing.form, ...patch }, review: null })

    const field = (id: LimitField, label: string, key: keyof KindForm, hint: string, suffix: string) => editing && (
        <label key={id} className="flex flex-col gap-1">
            <span className="text-[11px] font-black" style={{ color: colors.textPrimary }}>{label}</span>
            <div className="flex items-center gap-2">
                <input value={String(editing.form[key])} onChange={(e) => setForm({ [key]: e.target.value } as Partial<KindForm>)} inputMode="decimal" placeholder={hint}
                    className="flex-1 h-10 rounded-2xl px-3 text-[13px] outline-none" style={{ background: colors.surface, border: `1.5px solid ${editing.errors[id] ? '#ef4444' : colors.border}`, color: colors.textPrimary }} />
                <span className="text-[11px] w-16" style={{ color: colors.textSecondary }}>{suffix}</span>
            </div>
            {editing.errors[id] && <span className="text-[11px] font-bold" style={{ color: '#ef4444' }}>{editing.errors[id]}</span>}
        </label>
    )
    const toggle = (label: string, on: boolean, set: (v: boolean) => void) => (
        <button type="button" onClick={() => set(!on)} className="flex items-center justify-between h-10 rounded-2xl px-3 text-[12px] font-black active:scale-95" style={{ background: colors.surface, border: `1.5px solid ${on ? ORANGE : colors.border}`, color: colors.textPrimary }}>
            {label}<span style={{ color: on ? ORANGE : colors.textSecondary }}>{on ? 'Sim' : 'Não'}</span>
        </button>
    )

    return (
        <div className="flex flex-col gap-4">
            {/* ===== resumo e interruptor ===== */}
            <div style={cardStyle} className="flex flex-col gap-3">
                <div>
                    <h2 className="text-base font-black" style={{ color: colors.textPrimary }}>Uploads</h2>
                    <p className="text-[12px]" style={{ color: colors.textSecondary }}>O que entra no armazenamento, quem envia, quanto e com que ritmo. Os limites valem para todo mundo; só você muda aqui.</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {chip(plural(t.files, 'arquivo', 'arquivos'))}{chip(formatBytes(t.bytes))}{chip(plural(t.owners, 'pessoa', 'pessoas'))}
                    {chip(`${plural(t.grants_24h, 'envio', 'envios')} em 24 h`)}{chip(`${plural(t.denials_24h, 'recusa', 'recusas')} em 24 h`, t.denials_24h > 0 ? '#f59e0b' : undefined)}{chip(plural(t.blocks_active, 'bloqueio', 'bloqueios'), t.blocks_active > 0 ? '#ef4444' : undefined)}
                </div>
                {t.unknown_owner_files > 0 && <p className="text-[11px]" style={{ color: colors.textSecondary }}>{plural(t.unknown_owner_files, 'arquivo antigo', 'arquivos antigos')} sem dono registrado (enviados antes do controle): não aparecem nos maiores consumidores.</p>}

                <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: soft, border: overview.enforced ? `1.5px solid ${ORANGE}` : 'none' }}>
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-black" style={{ color: colors.textPrimary }}>Envio só com autorização</p>
                        {chip(overview.enforced ? 'LIGADO' : 'DESLIGADO', overview.enforced ? '#22c55e' : '#f59e0b')}
                    </div>
                    <p className="text-[12px]" style={{ color: colors.textSecondary }}>
                        {overview.enforced
                            ? 'Quem tenta enviar sem a autorização do app é recusado pelo próprio armazenamento. Ritmo, cotas e bloqueios valem para todo mundo.'
                            : 'Hoje o app pede autorização (ritmo, cotas e bloqueios valem para quem usa o app), mas quem pular o app ainda consegue enviar direto. Ligar fecha esse caminho.'}
                    </p>
                    {confirmSwitch ? (
                        <div className="rounded-2xl p-2.5 flex flex-col gap-2" style={{ background: colors.surface, border: `1.5px solid ${ORANGE}` }}>
                            <p className="text-[13px] font-black" style={{ color: colors.textPrimary }}>{overview.enforced ? 'Desligar o envio só com autorização?' : 'Ligar o envio só com autorização?'}</p>
                            <p className="text-[12px]" style={{ color: colors.textSecondary }}>
                                {overview.enforced ? 'Volta a aceitar envio direto, sem autorização. Vale na hora.' : 'Ligue só depois de publicar a versão nova do app: a versão antiga não pede autorização e deixaria de enviar fotos e vídeos. Dá para desligar de novo a qualquer momento, na hora.'}
                            </p>
                            <div className="grid grid-cols-2 gap-1.5">
                                <button onClick={() => setConfirmSwitch(false)} className={pill} style={{ background: soft, color: colors.textPrimary }}>Cancelar</button>
                                <button disabled={busy} onClick={() => run({ action: 'set_enforced', on: !overview.enforced }, overview.enforced ? 'Desligado.' : 'Ligado.', () => setConfirmSwitch(false))} className={`${pill} text-white`} style={{ background: ORANGE }}>{overview.enforced ? 'Desligar agora' : 'Ligar agora'}</button>
                            </div>
                        </div>
                    ) : (
                        <button onClick={() => setConfirmSwitch(true)} className={pill} style={{ background: overview.enforced ? soft : ORANGE, color: overview.enforced ? colors.textPrimary : '#fff' }}>{overview.enforced ? 'Desligar' : 'Ligar'}</button>
                    )}
                </div>
            </div>

            {/* ===== alerta da cota do Supabase ===== */}
            {meters.length > 0 && (
                <div style={cardStyle} className="flex flex-col gap-2.5">
                    <h3 className="text-sm font-black" style={{ color: colors.textPrimary }}>Cota do Supabase</h3>
                    {meters.map((m) => {
                        const pct = meterPct(m); const tone = meterTone(pct); const color = tone === 'danger' ? '#ef4444' : tone === 'warn' ? '#f59e0b' : '#22c55e'
                        return (
                            <div key={m.label} className="flex flex-col gap-1">
                                <div className="flex items-center justify-between text-[12px]"><span style={{ color: colors.textPrimary }} className="font-bold">{m.label}</span><span style={{ color }} className="font-black">{m.used.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} de {m.included.toLocaleString('pt-BR')} {m.unit} · {Math.round(pct)}%</span></div>
                                <div className="h-2 rounded-full overflow-hidden" style={{ background: soft }}><div style={{ width: `${Math.min(100, pct)}%`, background: color, height: '100%' }} /></div>
                                {tone !== 'ok' && <p className="text-[11px] font-bold" style={{ color }}>{tone === 'danger' ? 'Quase no limite' : 'Passou de 80% do que o plano inclui'}: vale reduzir envios pesados ou mover arquivos para outro armazenamento.</p>}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* ===== Cloudflare R2 (vídeo e música) ===== */}
            {data.r2 && (
                <div style={cardStyle} className="flex flex-col gap-2.5">
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <h3 className="text-sm font-black" style={{ color: colors.textPrimary }}>Cloudflare R2 (vídeo e música)</h3>
                            <p className="text-[12px]" style={{ color: colors.textSecondary }}>Armazenamento para arquivos pesados, fora da cota do Supabase. O tipo “Vídeo e música (R2)” só deve ser ligado depois de o teste abaixo passar.</p>
                        </div>
                        {chip(data.r2.configured ? 'CONFIGURADO' : 'NÃO CONFIGURADO', data.r2.configured ? '#22c55e' : '#f59e0b')}
                    </div>
                    {data.r2.configured
                        ? <p className="text-[12px]" style={{ color: colors.textSecondary }}>Bucket <b style={{ color: colors.textPrimary }}>{data.r2.bucket}</b> · endereço público {data.r2.publicBase ? <b style={{ color: colors.textPrimary }}>{data.r2.publicBase}</b> : 'ainda não ligado (os arquivos só abrem por link assinado)'}.</p>
                        : <ul className="flex flex-col gap-0.5">{data.r2.problems.map((p) => <li key={p} className="text-[12px] font-bold" style={{ color: '#f59e0b' }}>{p}</li>)}</ul>}
                    <button disabled={busy || !data.r2.configured} onClick={checkR2} className={pill} style={{ background: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}` }}>Testar o R2</button>
                    {r2Check && (
                        <div className="rounded-2xl p-3 flex flex-col gap-1" style={{ background: soft, border: `1.5px solid ${r2Check.ok ? '#22c55e' : '#ef4444'}` }}>
                            <p className="text-[13px] font-black" style={{ color: colors.textPrimary }}>{r2Check.ok ? 'R2 funcionando' : 'O teste não passou'}</p>
                            {r2Check.problems?.map((p) => <p key={p} className="text-[12px] font-bold" style={{ color: '#ef4444' }}>{p}</p>)}
                            {r2Check.steps.map((st) => (
                                <p key={st.step} className="text-[12px]" style={{ color: st.ok ? colors.textPrimary : '#ef4444' }}>{st.ok ? '✓' : '✗'} {st.step} — {st.detail} <span style={{ color: colors.textSecondary }}>({st.ms} ms)</span></p>
                            ))}
                            {!r2Check.ok && r2Check.steps.some((st) => !st.ok && /40[13]/.test(st.detail)) && <p className="text-[11px]" style={{ color: colors.textSecondary }}>Erro 403 costuma ser chave errada, ou chave sem permissão de leitura e escrita neste bucket. Confira as variáveis na Vercel e o escopo do token na Cloudflare.</p>}
                        </div>
                    )}
                </div>
            )}

            {/* ===== por tipo ===== */}
            <div style={cardStyle} className="flex flex-col gap-2.5">
                <h3 className="text-sm font-black" style={{ color: colors.textPrimary }}>Por tipo de envio</h3>
                {kinds.map((k) => {
                    const isEditing = editing?.kind === k.kind
                    return (
                        <div key={k.kind} className="rounded-2xl p-3 flex flex-col gap-1.5" style={{ background: soft, opacity: k.enabled ? 1 : 0.7 }}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0"><p className="text-[13px] font-black truncate" style={{ color: colors.textPrimary }}>{k.label}</p><p className="text-[11px]" style={{ color: colors.textSecondary }}>{k.bucket} · {k.provider}</p></div>
                                <div className="flex gap-1 flex-wrap justify-end">{!k.enabled && chip('DESLIGADO', '#ef4444')}{k.requires_plan && chip('EXIGE PLANO', ORANGE)}{k.denials_24h > 0 && chip(plural(k.denials_24h, 'recusa', 'recusas'), '#f59e0b')}</div>
                            </div>
                            <p className="text-[12px]" style={{ color: colors.textPrimary }}><b>{plural(k.files, 'arquivo', 'arquivos')}</b> · <b>{formatBytes(k.bytes)}</b> · {plural(k.owners, 'pessoa', 'pessoas')}</p>
                            <p className="text-[11px]" style={{ color: colors.textSecondary }}>Últimas 24 h: {plural(k.grants_24h, 'envio', 'envios')} · {formatBytes(k.bytes_24h)}</p>
                            <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                                Arquivo até {limitText('max_bytes', k.max_bytes)} · {limitText('per_hour_files', k.per_hour_files)} · {limitText('per_day_bytes', k.per_day_bytes)}/dia · {limitText('per_user_bytes', k.per_user_bytes)} por pessoa
                            </p>

                            {isEditing && editing ? (
                                <div className="rounded-2xl p-2.5 flex flex-col gap-2.5" style={{ background: colors.surface, border: `1.5px solid ${ORANGE}` }}>
                                    {editing.review ? (
                                        <>
                                            <p className="text-[13px] font-black" style={{ color: colors.textPrimary }}>Confirmar mudanças em {k.label}</p>
                                            <ul className="flex flex-col gap-1">{(Object.keys(editing.review) as LimitField[]).map((f) => <li key={f} className="text-[12px]" style={{ color: colors.textPrimary }}><b>{FIELD_LABEL[f]}:</b> {limitText(f, k[f])} → <b>{limitText(f, editing.review![f])}</b></li>)}</ul>
                                            {'max_bytes' in editing.review && <p className="text-[11px]" style={{ color: colors.textSecondary }}>O tamanho máximo também muda no armazenamento: arquivos maiores passam a ser recusados na hora.</p>}
                                            <div className="grid grid-cols-2 gap-1.5">
                                                <button onClick={() => setEditing({ ...editing, review: null })} className={pill} style={{ background: soft, color: colors.textPrimary }}>Voltar</button>
                                                <button disabled={busy} onClick={() => run({ action: 'update_kind', kind: k.kind, patch: editing.review }, 'Limites salvos.', () => setEditing(null))} className={`${pill} text-white`} style={{ background: ORANGE }}>Salvar</button>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="grid grid-cols-2 gap-1.5">{toggle('Tipo ligado', editing.form.enabled, (v) => setForm({ enabled: v }))}{toggle('Exige plano', editing.form.requires_plan, (v) => setForm({ requires_plan: v }))}</div>
                                            {field('max_bytes', 'Tamanho máximo do arquivo', 'max_mb', 'ex.: 5', 'MB')}
                                            {field('per_hour_files', 'Arquivos por hora (por pessoa)', 'per_hour_files', 'vazio = sem limite', 'arquivos')}
                                            {field('per_day_bytes', 'Envio por dia (por pessoa)', 'per_day_mb', 'vazio = sem limite', 'MB')}
                                            {field('per_user_bytes', 'Espaço total (por pessoa)', 'per_user_mb', 'vazio = sem limite', 'MB')}
                                            {field('grant_minutes', 'Validade da autorização', 'grant_minutes', '15', 'minutos')}
                                            <div className="grid grid-cols-2 gap-1.5">
                                                <button onClick={() => setEditing(null)} className={pill} style={{ background: soft, color: colors.textPrimary }}>Cancelar</button>
                                                <button onClick={review} className={`${pill} text-white`} style={{ background: ORANGE }}>Revisar</button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-1.5">
                                    <button onClick={() => startEdit(k)} className={pill} style={{ background: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}` }}>Editar limites</button>
                                    <button onClick={() => showTop(k.kind)} className={pill} style={{ background: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}` }}>Ver maiores</button>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* ===== limpeza de arquivos sem uso (Camada 6) ===== */}
            {data.cleanup && (() => {
                const c = data.cleanup
                const on = c.settings.enabled
                const saveForm = () => {
                    if (!cleanForm) return
                    const r = cleanupFormToPatch(cleanForm.form, c.settings)
                    if (!r.ok) { setCleanForm({ ...cleanForm, errors: r.errors }); return }
                    if (Object.keys(r.patch).length === 0) { toast.info('Nada mudou.'); setCleanForm(null); return }
                    run({ action: 'cleanup_settings', patch: r.patch }, 'Configuração salva.', () => setCleanForm(null))
                }
                const cfield = (f: Exclude<CleanupField, 'enabled'>, hint: string, suffix: string) => cleanForm && (
                    <label key={f} className="flex flex-col gap-1">
                        <span className="text-[11px] font-black" style={{ color: colors.textPrimary }}>{CLEANUP_LABEL[f]}</span>
                        <div className="flex items-center gap-2">
                            <input value={cleanForm.form[f]} onChange={(e) => setCleanForm({ ...cleanForm, form: { ...cleanForm.form, [f]: e.target.value } })} inputMode="numeric" placeholder={hint}
                                className="flex-1 h-10 rounded-2xl px-3 text-[13px] outline-none" style={{ background: colors.surface, border: `1.5px solid ${cleanForm.errors[f] ? '#ef4444' : colors.border}`, color: colors.textPrimary }} />
                            <span className="text-[11px] w-16" style={{ color: colors.textSecondary }}>{suffix}</span>
                        </div>
                        {cleanForm.errors[f] && <span className="text-[11px] font-bold" style={{ color: '#ef4444' }}>{cleanForm.errors[f]}</span>}
                    </label>
                )
                return (
                    <div style={cardStyle} className="flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <h3 className="text-sm font-black" style={{ color: colors.textPrimary }}>Limpeza de arquivos sem uso</h3>
                                <p className="text-[12px]" style={{ color: colors.textSecondary }}>Fotos e vídeos que ficaram no armazenamento mas não aparecem mais em nada do iUser (envio abandonado, item apagado). Rodam todo dia de madrugada.</p>
                            </div>
                            {chip(on ? 'APAGA DE VERDADE' : 'SÓ SIMULA', on ? '#ef4444' : '#22c55e')}
                        </div>
                        <p className="text-[12px]" style={{ color: colors.textSecondary }}>
                            {on ? `Arquivo sem uso há mais de ${c.settings.min_age_days} dias é marcado; marcado há ${c.settings.quarantine_days} dias e ainda sem uso é apagado de vez (até ${c.settings.max_per_run} por rodada).`
                                : `Desligada: a rotina só procura e marca (quarentena de ${c.settings.quarantine_days} dias). Nada é apagado até você ligar.`}
                            {' '}Se aparecer arquivo demais de uma vez, a rotina para sozinha (disjuntor).
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {chip(`${plural(c.counts.orphans, 'sem uso', 'sem uso')} · ${formatBytes(c.counts.orphan_bytes)}`, c.counts.orphans > 0 ? '#f59e0b' : undefined)}
                            {chip(`${plural(c.counts.due, 'pronto', 'prontos')} para apagar`, c.counts.due > 0 ? '#ef4444' : undefined)}
                            {chip(`${plural(c.counts.kept, 'mantido', 'mantidos')}`)}
                            {chip(`já apagados: ${plural(c.counts.deleted_total, 'arquivo', 'arquivos')} · ${formatBytes(c.counts.freed_bytes)}`)}
                        </div>
                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                            Entram na limpeza: {c.eligible_kinds.join(', ')}. <b>Nunca entram</b>: {c.protected_kinds.join(', ')} (prova de entrega e conteúdo que alguém comprou).
                        </p>

                        {cleanResult && (
                            <div className="rounded-2xl p-3 flex flex-col gap-1" style={{ background: soft, border: `1.5px solid ${cleanResult.ok ? '#22c55e' : '#ef4444'}` }}>
                                <p className="text-[13px] font-black" style={{ color: colors.textPrimary }}>{cleanResult.dryRun ? 'Simulação' : 'Limpeza'} {cleanResult.ok ? 'concluída' : 'com problemas'}</p>
                                <p className="text-[12px]" style={{ color: colors.textPrimary }}>
                                    Olhou {cleanResult.scanned} · marcou {cleanResult.marked} · desmarcou {cleanResult.cleared} ·{' '}
                                    {cleanResult.dryRun ? <>{cleanResult.due} já poderiam ser apagados ({formatBytes(cleanResult.wouldFreeBytes)}{cleanResult.r2Strays > 0 ? `, ${cleanResult.r2Strays} solto${cleanResult.r2Strays === 1 ? '' : 's'} no R2` : ''})</> : <b>apagou {cleanResult.deleted} ({formatBytes(cleanResult.bytesFreed)})</b>}
                                </p>
                                {cleanResult.notes.map((n, i) => <p key={i} className="text-[11px] font-bold" style={{ color: '#ef4444' }}>{n}</p>)}
                                {cleanResult.files.length > 0 && <p className="text-[11px]" style={{ color: colors.textSecondary }}>{cleanResult.dryRun ? 'Seriam apagados' : 'Apagados'}: {cleanResult.files.slice(0, 5).map((f) => fileLabel(f.key)).join(', ')}{cleanResult.files.length > 5 ? '…' : ''}</p>}
                            </div>
                        )}

                        {cleanConfirm === 'switch' && (
                            <div className="rounded-2xl p-2.5 flex flex-col gap-2" style={{ background: colors.surface, border: `1.5px solid ${ORANGE}` }}>
                                <p className="text-[13px] font-black" style={{ color: colors.textPrimary }}>{on ? 'Voltar a só simular?' : 'Ligar a exclusão de verdade?'}</p>
                                <p className="text-[12px]" style={{ color: colors.textSecondary }}>
                                    {on ? 'A rotina continua procurando e marcando, mas para de apagar. Vale na hora.'
                                        : `Apagar é definitivo: o arquivo some do armazenamento e não volta. Só será apagado o que está marcado há ${c.settings.quarantine_days} dias ou mais, sem uso, e que você não marcou como “manter”. Confira a lista de candidatos abaixo antes de ligar (hoje: ${plural(c.counts.due, 'pronto', 'prontos')}).`}
                                </p>
                                <div className="grid grid-cols-2 gap-1.5">
                                    <button onClick={() => setCleanConfirm(null)} className={pill} style={{ background: soft, color: colors.textPrimary }}>Cancelar</button>
                                    <button disabled={busy} onClick={() => run({ action: 'cleanup_settings', patch: { enabled: !on } }, on ? 'Voltou a só simular.' : 'Exclusão de verdade ligada.', () => setCleanConfirm(null))} className={`${pill} text-white`} style={{ background: on ? ORANGE : '#ef4444' }}>{on ? 'Só simular' : 'Ligar'}</button>
                                </div>
                            </div>
                        )}
                        {cleanConfirm === 'run' && (
                            <div className="rounded-2xl p-2.5 flex flex-col gap-2" style={{ background: colors.surface, border: '1.5px solid #ef4444' }}>
                                <p className="text-[13px] font-black" style={{ color: colors.textPrimary }}>Apagar agora?</p>
                                <p className="text-[12px]" style={{ color: colors.textSecondary }}>Apaga de vez os arquivos prontos (hoje: {plural(c.counts.due, 'arquivo', 'arquivos')}, até {c.settings.max_per_run} por rodada). Não dá para desfazer.</p>
                                <div className="grid grid-cols-2 gap-1.5">
                                    <button onClick={() => setCleanConfirm(null)} className={pill} style={{ background: soft, color: colors.textPrimary }}>Cancelar</button>
                                    <button disabled={busy} onClick={() => runCleanup(false)} className={`${pill} text-white`} style={{ background: '#ef4444' }}>Apagar agora</button>
                                </div>
                            </div>
                        )}

                        {cleanForm ? (
                            <div className="rounded-2xl p-2.5 flex flex-col gap-2.5" style={{ background: colors.surface, border: `1.5px solid ${ORANGE}` }}>
                                {cfield('min_age_days', '3', 'dias')}{cfield('quarantine_days', '7', 'dias')}{cfield('max_per_run', '200', 'arquivos')}
                                <div className="grid grid-cols-2 gap-1.5">
                                    <button onClick={() => setCleanForm(null)} className={pill} style={{ background: soft, color: colors.textPrimary }}>Cancelar</button>
                                    <button disabled={busy} onClick={saveForm} className={`${pill} text-white`} style={{ background: ORANGE }}>Salvar</button>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-1.5">
                                <button disabled={busy} onClick={() => runCleanup(true)} className={pill} style={{ background: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}` }}>Simular agora</button>
                                <button disabled={busy || !on || c.counts.due === 0} onClick={() => setCleanConfirm('run')} className={pill} style={{ background: colors.surface, color: '#ef4444', border: '1px solid #ef444455' }}>Apagar agora</button>
                                <button onClick={() => setCleanForm({ form: cleanupToForm(c.settings), errors: {} })} className={pill} style={{ background: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}` }}>Prazos e limites</button>
                                <button onClick={() => setCleanConfirm('switch')} className={`${pill} ${on ? '' : 'text-white'}`} style={{ background: on ? soft : '#ef4444', color: on ? colors.textPrimary : '#fff' }}>{on ? 'Voltar a só simular' : 'Ligar a exclusão'}</button>
                            </div>
                        )}

                        <h4 className="text-[12px] font-black mt-1" style={{ color: colors.textPrimary }}>Candidatos</h4>
                        {c.candidates.length === 0 && <p className="text-[12px]" style={{ color: colors.textSecondary }}>Nenhum arquivo sem uso encontrado até agora.</p>}
                        {c.candidates.map((f) => (
                            <div key={f.id} className="rounded-2xl p-3 flex items-center justify-between gap-2" style={{ background: soft }}>
                                <div className="min-w-0">
                                    <p className="text-[12px] font-black truncate" style={{ color: colors.textPrimary }}>{fileLabel(f.key)}</p>
                                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>{f.kind_label} · {formatBytes(f.bytes)} · <b style={{ color: f.keep ? '#22c55e' : f.due ? '#ef4444' : '#f59e0b' }}>{candidateStatus(f)}</b></p>
                                </div>
                                <button disabled={busy} onClick={() => run({ action: 'cleanup_keep', id: f.id, keep: !f.keep }, f.keep ? 'Volta a poder ser limpo.' : 'Marcado para manter.')} className="h-9 px-3 rounded-full text-[11px] font-black active:scale-95 shrink-0" style={{ background: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}` }}>{f.keep ? 'Deixar de manter' : 'Manter'}</button>
                            </div>
                        ))}

                        <h4 className="text-[12px] font-black mt-1" style={{ color: colors.textPrimary }}>Últimas rodadas</h4>
                        {c.runs.length === 0 && <p className="text-[12px]" style={{ color: colors.textSecondary }}>Nenhuma rodada ainda.</p>}
                        {c.runs.map((r, i) => (
                            <p key={i} className="text-[12px]" style={{ color: colors.textPrimary }}>
                                <span style={{ color: colors.textSecondary }}>{fmt(r.started_at)} · {r.source === 'cron' ? 'automática' : 'manual'} · </span>{runSummary(r, formatBytes)}
                            </p>
                        ))}
                    </div>
                )
            })()}

            {/* ===== maiores consumidores ===== */}
            <div style={cardStyle} className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-black" style={{ color: colors.textPrimary }}>Maiores consumidores</h3>
                    {topKind ? <button onClick={() => showTop(null)} className="text-[11px] font-black underline" style={{ color: ORANGE }}>{kindName(topKind)} · ver todos</button> : <span className="text-[11px]" style={{ color: colors.textSecondary }}>todos os tipos</span>}
                </div>
                {top.length === 0 && <p className="text-[12px]" style={{ color: colors.textSecondary }}>Ninguém com arquivos registrados ainda.</p>}
                {top.map((o) => (
                    <div key={o.profile_id} className="rounded-2xl p-3 flex items-center justify-between gap-2" style={{ background: soft }}>
                        <div className="min-w-0">
                            <p className="text-[13px] font-black truncate" style={{ color: colors.textPrimary }}>{who(o)} {o.blocked && chip('BLOQUEADO', '#ef4444')}</p>
                            <p className="text-[11px]" style={{ color: colors.textSecondary }}>{plural(o.files, 'arquivo', 'arquivos')} · {formatBytes(o.bytes)} · 24 h: {plural(o.files_24h, 'envio', 'envios')}, {formatBytes(o.bytes_24h)}</p>
                        </div>
                        {!o.blocked && <button onClick={() => setBlock({ profile_id: o.profile_id, label: who(o), kind: topKind || '', hours: '24', reason: '' })} className="h-9 px-3 rounded-full text-[11px] font-black active:scale-95" style={{ background: colors.surface, color: '#ef4444', border: '1px solid #ef444455' }}>Bloquear</button>}
                    </div>
                ))}
            </div>

            {/* ===== recusas ===== */}
            <div style={cardStyle} className="flex flex-col gap-2.5">
                <h3 className="text-sm font-black" style={{ color: colors.textPrimary }}>Barrados nas últimas 24 h</h3>
                {denials.length === 0 && <p className="text-[12px]" style={{ color: colors.textSecondary }}>Ninguém foi barrado. Bom sinal.</p>}
                {denials.map((d, i) => (
                    <div key={`${d.profile_id}:${d.kind}:${d.code}:${i}`} className="rounded-2xl p-3 flex items-center justify-between gap-2" style={{ background: soft }}>
                        <div className="min-w-0">
                            <p className="text-[13px] font-black truncate" style={{ color: colors.textPrimary }}>{who(d)} {d.blocked && chip('BLOQUEADO', '#ef4444')}</p>
                            <p className="text-[11px]" style={{ color: colors.textSecondary }}>{kindName(d.kind)} · <b style={{ color: ABUSE_CODES.has(d.code) ? '#ef4444' : colors.textSecondary }}>{denialLabel(d.code)}</b> · {plural(d.hits, 'tentativa', 'tentativas')} · última {fmt(d.last_at)}</p>
                        </div>
                        {!d.blocked && <button onClick={() => setBlock({ profile_id: d.profile_id, label: who(d), kind: '', hours: '24', reason: denialLabel(d.code) })} className="h-9 px-3 rounded-full text-[11px] font-black active:scale-95" style={{ background: colors.surface, color: '#ef4444', border: '1px solid #ef444455' }}>Bloquear</button>}
                    </div>
                ))}
            </div>

            {/* ===== bloqueios ativos ===== */}
            <div style={cardStyle} className="flex flex-col gap-2.5">
                <h3 className="text-sm font-black" style={{ color: colors.textPrimary }}>Bloqueios ativos</h3>
                {blocks.length === 0 && <p className="text-[12px]" style={{ color: colors.textSecondary }}>Nenhum bloqueio ativo.</p>}
                {blocks.map((b) => (
                    <div key={b.id} className="rounded-2xl p-3 flex flex-col gap-1.5" style={{ background: soft, border: '1.5px solid #ef444466' }}>
                        <p className="text-[13px] font-black" style={{ color: colors.textPrimary }}>{b.profile_label || 'Todas as pessoas'} · {kindName(b.kind)}</p>
                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>{b.reason ? `“${b.reason}” · ` : ''}{b.blocked_until ? `até ${fmt(b.blocked_until)}` : 'até você liberar'} · criado por {b.created_by_label} em {fmt(b.created_at)}</p>
                        {liftId === b.id ? (
                            <div className="grid grid-cols-2 gap-1.5">
                                <button onClick={() => setLiftId(null)} className={pill} style={{ background: colors.surface, color: colors.textPrimary }}>Manter</button>
                                <button disabled={busy} onClick={() => run({ action: 'unblock', id: b.id }, 'Bloqueio levantado.', () => setLiftId(null))} className={`${pill} text-white`} style={{ background: ORANGE }}>Liberar agora</button>
                            </div>
                        ) : <button onClick={() => setLiftId(b.id)} className={pill} style={{ background: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}` }}>Liberar</button>}
                    </div>
                ))}
            </div>

            {/* ===== histórico ===== */}
            <div style={cardStyle} className="flex flex-col gap-2">
                <h3 className="text-sm font-black" style={{ color: colors.textPrimary }}>Histórico de mudanças</h3>
                {audit.length === 0 && <p className="text-[12px]" style={{ color: colors.textSecondary }}>Nada mudou ainda.</p>}
                {(auditAll ? audit : audit.slice(0, 8)).map((a) => (
                    <p key={a.id} className="text-[12px]" style={{ color: colors.textPrimary }}>
                        <span style={{ color: colors.textSecondary }}>{fmt(a.changed_at)} · {a.changed_by_label} · </span>{auditText(a, kinds)}
                    </p>
                ))}
                {audit.length > 8 && !auditAll && <button onClick={() => setAuditAll(true)} className="text-[11px] font-black underline self-start" style={{ color: ORANGE }}>Ver mais ({audit.length - 8})</button>}
            </div>

            {/* ===== bloquear (folha) ===== */}
            {block && (
                <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => !busy && setBlock(null)}>
                    <div className="w-full max-w-md rounded-3xl p-4 flex flex-col gap-3" style={{ background: colors.background, border: `1px solid ${colors.border}` }} onClick={(e) => e.stopPropagation()}>
                        <p className="text-[15px] font-black" style={{ color: colors.textPrimary }}>Bloquear envios de {block.label}</p>
                        <label className="flex flex-col gap-1"><span className="text-[11px] font-black" style={{ color: colors.textPrimary }}>De quê</span>
                            <select value={block.kind} onChange={(e) => setBlock({ ...block, kind: e.target.value })} className="h-10 rounded-2xl px-3 text-[13px]" style={{ background: colors.surface, border: `1.5px solid ${colors.border}`, color: colors.textPrimary }}>
                                <option value="">Todos os tipos de envio</option>{kinds.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                            </select></label>
                        <label className="flex flex-col gap-1"><span className="text-[11px] font-black" style={{ color: colors.textPrimary }}>Por quanto tempo</span>
                            <select value={block.hours} onChange={(e) => setBlock({ ...block, hours: e.target.value })} className="h-10 rounded-2xl px-3 text-[13px]" style={{ background: colors.surface, border: `1.5px solid ${colors.border}`, color: colors.textPrimary }}>
                                {BLOCK_DURATIONS.map((d) => <option key={d.label} value={d.hours == null ? '' : String(d.hours)}>{d.label}</option>)}
                            </select></label>
                        <label className="flex flex-col gap-1"><span className="text-[11px] font-black" style={{ color: colors.textPrimary }}>Motivo (a pessoa vê)</span>
                            <input value={block.reason} onChange={(e) => setBlock({ ...block, reason: e.target.value })} maxLength={300} placeholder="ex.: envio em excesso" className="h-10 rounded-2xl px-3 text-[13px] outline-none" style={{ background: colors.surface, border: `1.5px solid ${colors.border}`, color: colors.textPrimary }} /></label>
                        <p className="text-[12px]" style={{ color: colors.textSecondary }}>
                            {block.label} {block.kind ? `não poderá enviar “${kindName(block.kind)}”` : 'não poderá enviar nenhum arquivo'} {block.hours ? `por ${BLOCK_DURATIONS.find((d) => String(d.hours) === block.hours)?.label}` : 'até você liberar'}. Os arquivos que já enviou continuam onde estão.
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                            <button disabled={busy} onClick={() => setBlock(null)} className={pill} style={{ background: soft, color: colors.textPrimary }}>Cancelar</button>
                            <button disabled={busy} onClick={() => run({ action: 'block', profile_id: block.profile_id, kind: block.kind || null, hours: block.hours ? Number(block.hours) : null, reason: block.reason }, 'Bloqueado.', () => setBlock(null))} className={`${pill} text-white`} style={{ background: '#ef4444' }}>Bloquear</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
