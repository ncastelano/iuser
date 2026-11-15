// src/components/AdminDashboard/DeliveryDisputesSection.tsx
//
// Admin → Disputas: o administrador geral decide as ENTREGAS CONTESTADAS (cliente diz "não recebi", mesmo com a prova) olhando as evidências que o banco guardou — o código foi usado?,
// quanto tempo o entregador esperou na porta, a que distância do endereço concluiu, a foto — e as respostas da loja e do entregador; e resolve os REPASSES de dinheiro que a loja contestou.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/lib/toast'
import { callAdminApi } from '@/lib/callAdminApi'
import { Spinner } from '@/components/Spinner'
import type { ThemeColors } from '@/app/contexts/theme'
import { brl, OUTCOMES, OUTCOME_LABEL, parseEvidence, proofStrength, REASON_LABEL, REFUND_LABEL, type DisputeOutcome, type DisputeReason } from '@/modules/dues'

interface Dispute { id: string; orderId: string; reason: DisputeReason; note: string | null; status: 'open' | 'decided'; createdAt: string; customer: string; driver: string | null; store: string; evidence: Record<string, any>; photo: string | null; storeReply: string | null; driverReply: string | null; outcome: DisputeOutcome | null; decisionNote: string | null; decidedAt: string | null; refundAmount: number | null; refundStatus: string; refundContested: boolean }
interface DueRow { id: string; kind: string; amount: number | null; note: string | null; createdAt: string; declaredAt: string | null; method: string | null; driver: string; store: string }

const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function DeliveryDisputesSection({ cardStyle, colors }: { cardStyle: React.CSSProperties; colors: ThemeColors }) {
    const [loading, setLoading] = useState(true)
    const [disputes, setDisputes] = useState<Dispute[]>([])
    const [dues, setDues] = useState<DueRow[]>([])
    const [notes, setNotes] = useState<Record<string, string>>({})
    const [busy, setBusy] = useState<string | null>(null)
    // a decisão só vale depois de CONFIRMAR (evita toque sem querer) e o resultado fica na tela
    const [pick, setPick] = useState<{ id: string; outcome: DisputeOutcome } | null>(null)
    const [done, setDone] = useState<string | null>(null)

    const load = useCallback(async () => {
        try { const r = await callAdminApi<{ disputes: Dispute[]; dues: DueRow[] }>('/api/admin/delivery-disputes', { action: 'list' }); setDisputes(r.disputes); setDues(r.dues) }
        catch (e: any) { toast.error(e?.message || 'Erro ao carregar') } finally { setLoading(false) }
    }, [])
    useEffect(() => { load() }, [load])

    const act = async (key: string, payload: Record<string, unknown>, ok: string) => {
        setBusy(key)
        try { await callAdminApi('/api/admin/delivery-disputes', payload); toast.success(ok); setPick(null); setDone(ok); await load() } catch (e: any) { toast.error(e?.message || 'Não deu certo.') } finally { setBusy(null) }
    }

    if (loading) return <div className="p-8 flex justify-center"><Spinner size={22} /></div>
    const open = disputes.filter((d) => d.status === 'open'), decided = disputes.filter((d) => d.status === 'decided')
    const soft = `${colors.border}40`

    return (
        <div className="flex flex-col gap-4">
            <div style={cardStyle} className="p-4">
                <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>Disputas de entrega</h2>
                <p className="text-xs" style={{ color: colors.textSecondary }}>O cliente diz que não recebeu, mesmo com a prova. Decida olhando as evidências. O iUser não movimenta o dinheiro: a decisão cria a dívida do entregador com a loja e o reembolso que a loja deve ao cliente.</p>
            </div>

            {done && (
                <div className="rounded-2xl p-3 flex items-center justify-between gap-2" style={{ background: '#22c55e18', border: '1.5px solid #22c55e' }}>
                    <p className="text-[13px] font-black" style={{ color: colors.textPrimary }}>✓ {done}</p>
                    <button onClick={() => setDone(null)} className="text-[11px] font-bold underline" style={{ color: colors.textSecondary }}>Ok</button>
                </div>
            )}

            <div style={cardStyle} className="p-4 flex flex-col gap-3">
                <h3 className="text-sm font-black" style={{ color: colors.textPrimary }}>Para decidir ({open.length})</h3>
                {open.length === 0 && <p className="text-xs" style={{ color: colors.textSecondary }}>Nenhuma contestação aberta.</p>}
                {open.map((d) => {
                    const ev = parseEvidence(d.evidence), st = proofStrength(ev)
                    return (
                        <div key={d.id} className="rounded-2xl p-3 flex flex-col gap-1.5" style={{ background: soft }}>
                            <p className="text-[13px] font-black" style={{ color: colors.textPrimary }}>{REASON_LABEL[d.reason]}{d.note ? ` — “${d.note}”` : ''}</p>
                            <p className="text-[11px]" style={{ color: colors.textSecondary }}>{fmt(d.createdAt)} · cliente {d.customer} · loja {d.store} · entregador {d.driver || '—'}{ev.orderTotal != null ? ` · pedido ${brl(ev.orderTotal)} (${ev.paymentMethod || '—'})` : ''}</p>
                            <p className="text-[12px] font-bold" style={{ color: st.level === 'strong' ? '#16a34a' : st.level === 'medium' ? '#b45309' : '#dc2626' }}>Prova ({st.level === 'strong' ? 'forte' : st.level === 'medium' ? 'média' : 'fraca'}): {st.text}</p>
                            {ev.address && <p className="text-[11px]" style={{ color: colors.textSecondary }}>Endereço: {ev.address}</p>}
                            {d.photo && <a href={d.photo} target="_blank" rel="noreferrer"><img src={d.photo} alt="Foto da entrega" className="w-28 h-28 object-cover rounded-xl" /></a>}
                            {d.storeReply && <p className="text-[12px]" style={{ color: colors.textPrimary }}><b>Loja:</b> {d.storeReply}</p>}
                            {d.driverReply && <p className="text-[12px]" style={{ color: colors.textPrimary }}><b>Entregador:</b> {d.driverReply}</p>}
                            <input value={notes[d.id] || ''} onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))} placeholder="Motivo da decisão (as partes veem)" maxLength={500} className="h-10 px-3 rounded-full text-[13px] outline-none" style={{ background: colors.surface, color: colors.textPrimary }} />
                            {pick?.id === d.id ? (
                                <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: colors.surface, border: `1.5px solid #f97316` }}>
                                    <p className="text-[13px] font-black" style={{ color: colors.textPrimary }}>Confirmar: {OUTCOMES.find((o) => o.code === pick.outcome)?.label}</p>
                                    <p className="text-[12px]" style={{ color: colors.textSecondary }}>{OUTCOMES.find((o) => o.code === pick.outcome)?.hint} O cliente, a loja e o entregador serão avisados. Não dá para desfazer.</p>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        <button onClick={() => setPick(null)} className="h-10 rounded-full text-[12px] font-black active:scale-95" style={{ background: soft, color: colors.textPrimary }}>Voltar</button>
                                        <button onClick={() => act(`${d.id}-${pick.outcome}`, { action: 'decide', id: d.id, outcome: pick.outcome, note: notes[d.id] || '' }, `Decisão registrada: ${OUTCOMES.find((o) => o.code === pick.outcome)?.label}. As partes foram avisadas.`)} disabled={busy?.startsWith(d.id)} className="h-10 rounded-full text-[12px] font-black text-white active:scale-95 disabled:opacity-50" style={{ background: '#f97316' }}>{busy?.startsWith(d.id) ? 'Enviando…' : 'Confirmar decisão'}</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-1.5">
                                    {OUTCOMES.map((o) => (
                                        <button key={o.code} title={o.hint} onClick={() => setPick({ id: d.id, outcome: o.code })} className="h-10 rounded-full text-[12px] font-black active:scale-95" style={o.code === 'rejected' ? { background: colors.surface, color: colors.textPrimary, border: `1.5px solid ${colors.border}` } : { background: '#f97316', color: '#fff' }}>{o.label}</button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            <div style={cardStyle} className="p-4 flex flex-col gap-3">
                <h3 className="text-sm font-black" style={{ color: colors.textPrimary }}>Repasses contestados pela loja ({dues.length})</h3>
                {dues.length === 0 && <p className="text-xs" style={{ color: colors.textSecondary }}>Nenhum.</p>}
                {dues.map((d) => (
                    <div key={d.id} className="rounded-2xl p-3 flex flex-col gap-1.5" style={{ background: soft }}>
                        <p className="text-[13px] font-black" style={{ color: colors.textPrimary }}>{d.kind === 'machine' ? 'Maquininha' : brl(d.amount)} · {d.driver} → {d.store}</p>
                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>Declarado {d.declaredAt ? fmt(d.declaredAt) : '—'} {d.method ? `(${d.method})` : ''} · a loja diz: “{d.note || 'não recebi'}”</p>
                        <input value={notes[d.id] || ''} onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))} placeholder="Observação" maxLength={500} className="h-10 px-3 rounded-full text-[13px] outline-none" style={{ background: colors.surface, color: colors.textPrimary }} />
                        <div className="grid grid-cols-2 gap-1.5">
                            <button onClick={() => act(d.id + 'c', { action: 'decide_due', id: d.id, decision: 'confirmed', note: notes[d.id] || '' }, 'Resolvido: o repasse conta como feito.')} disabled={busy === d.id + 'c'} className="h-10 rounded-full text-[12px] font-black text-white active:scale-95 disabled:opacity-50" style={{ background: '#22c55e' }}>Repasse feito (liberar)</button>
                            <button onClick={() => act(d.id + 'w', { action: 'decide_due', id: d.id, decision: 'waived', note: notes[d.id] || '' }, 'Pendência perdoada.')} disabled={busy === d.id + 'w'} className="h-10 rounded-full text-[12px] font-black active:scale-95 disabled:opacity-50" style={{ background: colors.surface, color: colors.textPrimary, border: `1.5px solid ${colors.border}` }}>Perdoar</button>
                        </div>
                    </div>
                ))}
            </div>

            {decided.length > 0 && (
                <div style={cardStyle} className="p-4 flex flex-col gap-2">
                    <h3 className="text-sm font-black" style={{ color: colors.textPrimary }}>Decididas nos últimos 14 dias ({decided.length})</h3>
                    {decided.map((d) => (
                        <div key={d.id} className="rounded-2xl p-2.5" style={{ background: soft }}>
                            <p className="text-[12px] font-black" style={{ color: colors.textPrimary }}>{d.outcome ? OUTCOME_LABEL[d.outcome] : ''} <span className="font-normal" style={{ color: colors.textSecondary }}>· {d.decidedAt ? fmt(d.decidedAt) : ''}</span></p>
                            <p className="text-[11px]" style={{ color: colors.textSecondary }}>{d.customer} × {d.store}{d.driver ? ` × ${d.driver}` : ''} · {REFUND_LABEL[d.refundStatus] || ''}{d.refundContested ? ' (cliente contesta o reembolso)' : ''}{d.decisionNote ? ` · “${d.decisionNote}”` : ''}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
