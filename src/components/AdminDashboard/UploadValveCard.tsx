// src/components/AdminDashboard/UploadValveCard.tsx — Admin → Uploads: a VÁLVULA DE SEGURANÇA. Mede o armazenamento (real, do Storage) e a banda (estimada + o número que o admin digita do painel do Supabase)
// contra a cota do plano e, ligada, DESLIGA SOZINHA os tipos de envio mais pesados quando passa de 80% (e o Flash também a partir de 95%); religa quando cai a 65%. Nasce desligada: ligar pede confirmação.
// Cada tipo escolhe seu estágio (ou fica fora). "Liberar por X horas" religa na hora. Quem decide e mede é o banco (upload_valve_tick, a cada 10 minutos); aqui só se mostra e se configura.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { toast } from '@/lib/toast'
import { callAdminApi } from '@/lib/callAdminApi'
import {
    eventText, LEVEL_COLOR, STAGE_LABEL, STATE_LABEL, usedOfText, VALVE_FIELD_LABEL, valveFormToPatch, valveLevel, valveState, valveToForm,
    type ValveErrors, type ValveForm, type ValveStatus,
} from '@/modules/uploads'

type Colors = { textPrimary: string; textSecondary: string; border: string }
const fmtDate = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function UploadValveCard({ cardStyle, colors }: { cardStyle: React.CSSProperties; colors: Colors }) {
    const [st, setSt] = useState<ValveStatus | null>(null)
    const [busy, setBusy] = useState(false)
    const [confirmOn, setConfirmOn] = useState(false)
    const [form, setForm] = useState<{ f: ValveForm; errors: ValveErrors } | null>(null)
    const [hours, setHours] = useState(24)

    const call = useCallback(async (body: Record<string, unknown>, ok?: string) => {
        setBusy(true)
        try { const r = await callAdminApi<{ valve: ValveStatus }>('/api/admin/uploads', body); setSt(r.valve); if (ok) toast.success(ok); return true } catch (e: any) { toast.error(e?.message || 'Não deu certo.'); return false } finally { setBusy(false) }
    }, [])
    useEffect(() => { call({ action: 'valve' }) }, [call])
    if (!st) return null

    const s = st.settings, m = st.measure
    const state = valveState(s)
    const manualActive = s.egress_manual_gb != null && s.egress_manual_cycle === m.cycle_start
    const paused = st.kinds.filter((k) => k.paused)
    const labelOf = new Map(st.kinds.map((k) => [k.kind, k.label]))
    const badge = state === 'tripped' ? '#ef4444' : state === 'watching' ? '#22c55e' : state === 'override' ? '#f59e0b' : colors.textSecondary
    const input = 'w-full h-9 rounded-lg px-2 text-sm outline-none'
    const fs = { background: `${colors.border}30`, color: colors.textPrimary, border: `1px solid ${colors.border}` }

    const Gauge = ({ label, used, quota, pct, source, extra }: { label: string; used: number; quota: number; pct: number; source: string; extra?: string }) => {
        const lvl = valveLevel(pct, s), color = LEVEL_COLOR[lvl]
        return (
            <div className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-black" style={{ color: colors.textPrimary }}>{label}</span>
                    <span className="text-[12px] font-black" style={{ color }}>{pct}%</span>
                </div>
                <div className="relative h-2.5 rounded-full overflow-hidden" style={{ background: `${colors.border}` }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: color, transition: 'width .4s' }} />
                    <span className="absolute top-0 bottom-0 w-0.5" style={{ left: `${s.trip_pct}%`, background: colors.textPrimary, opacity: 0.55 }} title={`Desliga em ${s.trip_pct}%`} />
                    <span className="absolute top-0 bottom-0 w-0.5" style={{ left: `${s.critical_pct}%`, background: '#b91c1c' }} title={`Crítico em ${s.critical_pct}%`} />
                </div>
                <p className="text-[11px]" style={{ color: colors.textSecondary }}>{usedOfText(used, quota)} · cota {source === 'financeiro' ? 'do Financeiro' : 'da válvula'}{extra ? ` · ${extra}` : ''}</p>
            </div>
        )
    }

    return (
        <div style={cardStyle} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <h3 className="text-sm font-black flex items-center gap-1.5" style={{ color: colors.textPrimary }}><ShieldAlert size={15} style={{ color: '#f97316' }} /> Válvula de segurança</h3>
                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>Desliga sozinha os envios mais pesados quando o armazenamento ou a banda chegam perto da cota do plano, e religa quando o uso cai. Foto, logo, produto e prova de entrega nunca são desligadas.</p>
                </div>
                <span className="text-[10px] font-black rounded-full px-2 py-1 flex-shrink-0 text-white" style={{ background: badge }}>{STATE_LABEL[state]}</span>
            </div>

            <Gauge label="Armazenamento" used={m.storage_bytes} quota={m.storage_quota_bytes} pct={m.storage_pct} source={m.storage_quota_source} />
            <Gauge label="Banda de download" used={m.egress_bytes} quota={m.egress_quota_bytes} pct={m.egress_pct} source={m.egress_quota_source} extra={manualActive ? 'usando o número digitado do painel do Supabase' : 'só estimativa: o app não vê arquivo baixado nem música tocada'} />
            <p className="text-[11px] -mt-2" style={{ color: colors.textSecondary }}>Ciclo desde {new Date(m.cycle_start + 'T12:00:00').toLocaleDateString('pt-BR')}. Traço claro = onde desliga ({s.trip_pct}%); traço vermelho = crítico ({s.critical_pct}%). {s.last_eval_at ? `Última medição: ${fmtDate(s.last_eval_at)}.` : ''}</p>

            {state === 'tripped' && (
                <div className="rounded-xl p-3 flex flex-col gap-2" style={{ background: '#ef444414', border: '1px solid #ef444455' }}>
                    <p className="text-xs font-black" style={{ color: '#ef4444' }}>Disparada em {fmtDate(s.tripped_at!)} — {STAGE_LABEL[s.tripped_stage || 1]}. Motivo: {s.tripped_reason === 'egress' ? 'banda de download' : 'armazenamento'}.</p>
                    <p className="text-[11px]" style={{ color: colors.textPrimary }}>Envios pausados agora: <b>{paused.length ? paused.map((k) => k.label).join(', ') : 'nenhum'}</b>. Voltam sozinhos quando o uso cair a {s.resume_pct}%.</p>
                    <div className="flex gap-2 items-center">
                        <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="h-9 rounded-lg px-2 text-xs" style={fs} aria-label="Por quanto tempo"><option value={2}>2 horas</option><option value={24}>24 horas</option><option value={72}>3 dias</option></select>
                        <button disabled={busy} onClick={() => call({ action: 'valve_override', hours }, 'Envios liberados. A válvula não dispara até o prazo.')} className="h-9 px-4 rounded-full text-xs font-black text-white disabled:opacity-50" style={{ background: '#ef4444' }}>Liberar mesmo assim</button>
                    </div>
                </div>
            )}
            {state === 'override' && <p className="text-xs font-bold" style={{ color: '#f59e0b' }}>Liberada até {fmtDate(s.override_until!)}: a válvula não dispara nesse período.</p>}
            {state === 'off' && (m.storage_pct >= s.trip_pct || m.egress_pct >= s.trip_pct) && <p className="text-xs font-bold" style={{ color: '#ef4444' }}>O uso já passou de {s.trip_pct}% e a válvula está desligada: nada será pausado. Ligue-a para proteger o servidor.</p>}

            <div className="flex flex-wrap gap-2">
                {s.enabled ? (
                    <button disabled={busy} onClick={() => call({ action: 'valve_update', patch: { enabled: false } }, 'Válvula desligada. O que ela tinha pausado foi religado.')} className="h-9 px-4 rounded-full text-xs font-black disabled:opacity-50" style={{ background: `${colors.border}55`, color: colors.textPrimary }}>Desligar a válvula</button>
                ) : (
                    <button disabled={busy} onClick={() => setConfirmOn(true)} className="h-9 px-4 rounded-full text-xs font-black text-white disabled:opacity-50" style={{ background: '#f97316' }}>Ligar a válvula</button>
                )}
                <button disabled={busy} onClick={() => call({ action: 'valve_tick' }, 'Medição atualizada.')} className="h-9 px-4 rounded-full text-xs font-black disabled:opacity-50" style={{ background: `${colors.border}55`, color: colors.textPrimary }}>Medir agora</button>
                <button disabled={busy} onClick={() => setForm(form ? null : { f: valveToForm(s, manualActive), errors: {} })} className="h-9 px-4 rounded-full text-xs font-black" style={{ background: `${colors.border}55`, color: colors.textPrimary }}>{form ? 'Fechar configuração' : 'Configurar'}</button>
            </div>
            {confirmOn && (
                <div className="rounded-xl p-3 flex flex-col gap-2" style={{ background: '#f9731614', border: '1px solid #f9731655' }}>
                    <p className="text-xs" style={{ color: colors.textPrimary }}>Ao passar de <b>{s.trip_pct}%</b> do armazenamento ou da banda, a válvula <b>pausa os envios</b> de música, programa, curso/arquivos e vídeo do R2 (e o Flash a partir de {s.critical_pct}%) até o uso voltar a {s.resume_pct}%. Quem tentar enviar vê o aviso de espaço cheio. Confirma?</p>
                    <div className="flex gap-2">
                        <button disabled={busy} onClick={async () => { if (await call({ action: 'valve_update', patch: { enabled: true } }, 'Válvula ligada.')) setConfirmOn(false) }} className="h-9 px-4 rounded-full text-xs font-black text-white disabled:opacity-50" style={{ background: '#f97316' }}>Sim, ligar</button>
                        <button disabled={busy} onClick={() => setConfirmOn(false)} className="h-9 px-4 rounded-full text-xs font-black" style={{ background: `${colors.border}55`, color: colors.textPrimary }}>Cancelar</button>
                    </div>
                </div>
            )}

            {form && (
                <div className="rounded-xl p-3 flex flex-col gap-2" style={{ background: `${colors.border}20`, border: `1px solid ${colors.border}` }}>
                    {(Object.keys(VALVE_FIELD_LABEL) as (keyof ValveForm)[]).map((k) => (
                        <label key={k} className="flex flex-col gap-0.5">
                            <span className="text-[11px] font-bold" style={{ color: colors.textSecondary }}>{VALVE_FIELD_LABEL[k]}</span>
                            <input className={input} style={{ ...fs, borderColor: form.errors[k] ? '#ef4444' : colors.border }} value={form.f[k]} inputMode="decimal" placeholder={k === 'egress_manual_gb' ? 'vazio = só a estimativa' : ''} onChange={(e) => setForm({ f: { ...form.f, [k]: e.target.value }, errors: { ...form.errors, [k]: undefined } })} />
                            {form.errors[k] && <span className="text-[11px] font-bold" style={{ color: '#ef4444' }}>{form.errors[k]}</span>}
                        </label>
                    ))}
                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>A cota do Financeiro (Supabase → incluídos) tem prioridade quando preenchida. A banda digitada vale só para o ciclo atual: confira o número no painel do Supabase de vez em quando.</p>
                    <button disabled={busy} onClick={async () => {
                        const r = valveFormToPatch(form.f, s, manualActive)
                        if (!r.ok) { setForm({ f: form.f, errors: r.errors }); return }
                        if (Object.keys(r.patch).length === 0) { toast.info('Nada mudou.'); return }
                        if (await call({ action: 'valve_update', patch: r.patch }, 'Configuração salva.')) setForm(null)
                    }} className="h-9 rounded-full text-xs font-black text-white disabled:opacity-50" style={{ background: '#f97316' }}>Salvar</button>
                </div>
            )}

            <div className="flex flex-col gap-1">
                <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>Tipos sob a válvula</p>
                {st.kinds.map((k) => (
                    <div key={k.kind} className="flex items-center gap-2 text-xs rounded-lg px-2 py-1.5" style={{ background: `${colors.border}25` }}>
                        <span className="min-w-0 flex-1 break-words leading-snug" style={{ color: colors.textPrimary }}>{k.label}{k.paused ? <b style={{ color: '#ef4444' }}> · pausado</b> : !k.enabled ? <span style={{ color: colors.textSecondary }}> · desligado pelo admin</span> : null}</span>
                        <select disabled={busy} value={k.stage ?? ''} onChange={(e) => call({ action: 'valve_kind', kind: k.kind, stage: e.target.value === '' ? null : Number(e.target.value) }, 'Estágio salvo.')} className="h-7 rounded-md px-1 text-[11px]" style={fs} aria-label={`Estágio de ${k.label}`}>
                            <option value="">Fora da válvula</option><option value={1}>Estágio 1</option><option value={2}>Estágio 2</option>
                        </select>
                    </div>
                ))}
            </div>

            {st.events.length > 0 && (
                <div className="flex flex-col gap-1">
                    <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>Histórico</p>
                    {st.events.slice(0, 6).map((e) => <p key={e.id} className="text-[11px]" style={{ color: colors.textSecondary }}><b style={{ color: colors.textPrimary }}>{fmtDate(e.at)}</b> · {eventText({ ...e, kinds: e.kinds.map((c) => labelOf.get(c) || c) })}</p>)}
                </div>
            )}
        </div>
    )
}
