// src/components/StoreDashboard/StoreDeliveryDues.tsx
//
// "Caixa das entregas" da LOJA (2.0 e 3.0): o que os entregadores iUser devem repassar (dinheiro recebido na porta, sem o frete), a maquininha que saiu com eles e as ENTREGAS
// CONTESTADAS pelos clientes (responder, reembolsar). O iUser não movimenta o dinheiro: o entregador declara e a loja confirma ("recebi" / "não recebi"); o reembolso do cliente é por fora
// e a loja só DECLARA. Só aparece quando há algo. Regras e prazos moram no banco (migration 20261130000012).
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Banknote, Check, Copy, CreditCard, Gavel, Truck } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { toast } from '@/lib/toast'
import {
    brl, confirmDue, declareFreight, declareRefund, dueIn, fetchFreightPayTarget, fetchMyDisputes, fetchStoreDues, KIND_LABEL, OUTCOME_LABEL, parseEvidence, proofStrength, REASON_LABEL, REFUND_LABEL, REFUND_METHODS, replyDispute, STATUS_LABEL,
    type Due, type MyDispute, type StoreDues,
} from '@/modules/dues'
import DuesBalances from '@/components/deliveries/DuesBalances'

const ORANGE = '#f97316', RED = '#ef4444', GREEN = '#22c55e'

export default function StoreDeliveryDues({ storeId, v3 = false }: { storeId: string; v3?: boolean }) {
    const { colors } = useTheme()
    const [dues, setDues] = useState<StoreDues | null>(null)
    const [disputes, setDisputes] = useState<MyDispute[]>([])
    const [busy, setBusy] = useState<string | null>(null)
    const [note, setNote] = useState<Record<string, string>>({})
    const [refuse, setRefuse] = useState<string | null>(null)
    const [payTo, setPayTo] = useState<{ id: string; name: string; key: string | null; amount: number } | null>(null)

    const load = useCallback(async () => {
        const [d, ds] = await Promise.all([fetchStoreDues(storeId).catch(() => null), fetchMyDisputes(storeId).catch(() => [] as MyDispute[])])
        setDues(d); setDisputes(ds.filter((x) => x.role === 'store'))
    }, [storeId])
    useEffect(() => { load(); const t = setInterval(load, 12000); return () => clearInterval(t) }, [load])

    const run = async (key: string, fn: () => Promise<void>, ok?: string) => {
        setBusy(key)
        try { await fn(); if (ok) toast.success(ok); setRefuse(null); setPayTo(null); await load() } catch (e: any) { toast.error(e?.message || 'Não deu certo.') } finally { setBusy(null) }
    }
    const openPay = async (d: Due) => {
        setBusy(`pq-${d.id}`)
        try { const t = await fetchFreightPayTarget(d.id); setPayTo({ id: d.id, name: t.driverName, key: t.pixKey, amount: t.amount }) } catch (e: any) { toast.error(e?.message || 'Não consegui abrir.') } finally { setBusy(null) }
    }

    const items = dues?.items ?? []
    if (!dues || (items.length === 0 && disputes.length === 0 && !dues.settlements.some((t) => t.status === 'declared'))) return null
    const soft = `${colors.border}40`
    const label = (d: Due) => (d.kind === 'machine' ? 'a maquininha' : d.kind === 'dispute_debt' ? 'a dívida da entrega contestada' : 'o repasse')

    return (
        <section className={`rounded-3xl p-4 flex flex-col gap-3 ${v3 ? '' : 'mb-6'}`} style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            <DuesBalances viewer="store" storeId={storeId} balances={dues.balances} settlements={dues.settlements} onChanged={load} />
            {items.length > 0 && (
                <>
                    <div>
                        <h2 className="text-base font-black flex items-center gap-1.5" style={{ color: colors.textPrimary }}><Banknote size={16} style={{ color: ORANGE }} /> Caixa das entregas</h2>
                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                            Dinheiro recebido na porta que o entregador deve repassar (o frete é dele){dues.pendingAmount > 0 ? <> · a receber: <b style={{ color: ORANGE }}>{brl(dues.pendingAmount)}</b></> : null}. Pedido pago direto a você (Pix, link ou Pix na porta): você paga o frete ao entregador{dues.freightAmount > 0 ? <> · a pagar: <b style={{ color: ORANGE }}>{brl(dues.freightAmount)}</b></> : null}.
                        </p>
                    </div>
                    {items.map((d) => (
                        <div key={d.id} className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: soft, border: d.overdue || d.status === 'disputed' ? `1.5px solid ${RED}` : 'none' }}>
                            <div className="flex items-start gap-2.5">
                                <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: d.kind === 'machine' ? '#3b82f6' : d.kind === 'dispute_debt' ? RED : d.kind === 'freight' ? ORANGE : GREEN }}>{d.kind === 'machine' ? <CreditCard size={17} /> : d.kind === 'freight' ? <Truck size={17} /> : <Banknote size={17} />}</span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[13px] font-black leading-tight" style={{ color: colors.textPrimary }}>{d.driverName || 'Entregador'}{d.driverSlug ? <span className="font-normal" style={{ color: colors.textSecondary }}> @{d.driverSlug}</span> : null} · {d.kind === 'machine' ? 'maquininha' : brl(d.amount)}</p>
                                    <p className="text-[11px]" style={{ color: d.overdue ? RED : colors.textSecondary }}>
                                        {d.kind === 'freight' ? 'Frete que você deve' : KIND_LABEL[d.kind]} · {d.settlementId && d.status === 'declared' ? 'no acerto pelo saldo' : d.kind === 'freight' && d.status === 'declared' ? 'esperando o entregador confirmar' : STATUS_LABEL[d.status]}{d.status === 'open' && d.dueAt ? ` · ${dueIn(d.dueAt)}` : ''}{d.status === 'declared' && !d.settlementId ? (d.method === 'pix' ? ' · por Pix' : d.method === 'em_maos' ? ' · em mãos' : '') : ''}
                                    </p>
                                </div>
                            </div>
                            {d.kind === 'freight' && (d.status === 'open' || d.status === 'disputed') && (
                                payTo?.id === d.id ? (
                                    <div className="rounded-2xl p-2.5 flex flex-col gap-2" style={{ background: colors.surface }}>
                                        {payTo.key ? (
                                            <>
                                                <p className="text-[11px]" style={{ color: colors.textSecondary }}>Pix para <b>{payTo.name}</b> · {brl(payTo.amount)}</p>
                                                <button onClick={() => { navigator.clipboard?.writeText(payTo.key as string); toast.success('Chave copiada') }} className="h-9 px-3 rounded-full text-[12px] font-black flex items-center justify-center gap-1.5 break-all" style={{ background: soft, color: colors.textPrimary }}><Copy size={13} className="flex-shrink-0" /> {payTo.key}</button>
                                            </>
                                        ) : <p className="text-[11px] font-bold" style={{ color: colors.textSecondary }}>{payTo.name} ainda não cadastrou a chave Pix: pague em mãos.</p>}
                                        <div className="grid grid-cols-2 gap-2">
                                            <button onClick={() => run(`fp-${d.id}`, () => declareFreight(d.id, 'pix'), 'Pronto! O entregador vai confirmar.')} disabled={!payTo.key || busy === `fp-${d.id}`} className="h-10 rounded-full text-[12.5px] font-black text-white disabled:opacity-40" style={{ background: GREEN }}><Check size={14} className="inline mr-1" />Já fiz o Pix</button>
                                            <button onClick={() => run(`fm-${d.id}`, () => declareFreight(d.id, 'em_maos'), 'Pronto! O entregador vai confirmar.')} disabled={busy === `fm-${d.id}`} className="h-10 rounded-full text-[12.5px] font-black disabled:opacity-40" style={{ background: colors.surface, color: colors.textPrimary, border: `1.5px solid ${colors.border}` }}>Paguei em mãos</button>
                                        </div>
                                    </div>
                                ) : (
                                    <button onClick={() => openPay(d)} disabled={busy === `pq-${d.id}`} className="h-10 rounded-full text-[12.5px] font-black text-white active:scale-95 disabled:opacity-50" style={{ background: ORANGE }}>Pagar o frete de {brl(d.amount)}</button>
                                )
                            )}
                            {d.kind !== 'freight' && !(d.settlementId && d.status === 'declared') && (d.status === 'declared' || d.status === 'open') && (
                                refuse === d.id ? (
                                    <div className="flex gap-2">
                                        <input value={note[d.id] || ''} onChange={(e) => setNote((n) => ({ ...n, [d.id]: e.target.value }))} placeholder="O que aconteceu?" maxLength={400} className="flex-1 min-w-0 h-10 px-3 rounded-full text-[13px] outline-none" style={{ background: colors.surface, color: colors.textPrimary }} />
                                        <button onClick={() => run(`n-${d.id}`, () => confirmDue(d.id, false, note[d.id] || ''), 'Contestado. O iUser vai analisar.')} disabled={!(note[d.id] || '').trim() || busy === `n-${d.id}`} className="h-10 px-4 rounded-full text-[12.5px] font-black text-white disabled:opacity-40 active:scale-95" style={{ background: RED }}>Enviar</button>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-2">
                                        <button onClick={() => run(`c-${d.id}`, () => confirmDue(d.id, true), 'Confirmado!')} disabled={busy === `c-${d.id}`} className="h-10 rounded-full text-[12.5px] font-black text-white active:scale-95 disabled:opacity-50" style={{ background: GREEN }}>Recebi {label(d)}</button>
                                        <button onClick={() => setRefuse(d.id)} className="h-10 rounded-full text-[12.5px] font-black active:scale-95" style={{ background: colors.surface, color: colors.textPrimary, border: `1.5px solid ${colors.border}` }}>Não recebi</button>
                                    </div>
                                )
                            )}
                            {d.status === 'disputed' && <p className="text-[11px] font-bold" style={{ color: RED }}>{d.kind === 'freight' ? 'O entregador diz que não recebeu este frete' : 'Você contestou'}{d.note ? `: “${d.note}”` : ''}. O iUser vai analisar.</p>}
                        </div>
                    ))}
                </>
            )}

            {disputes.length > 0 && (
                <>
                    <h2 className="text-base font-black flex items-center gap-1.5" style={{ color: colors.textPrimary }}><Gavel size={16} style={{ color: ORANGE }} /> Entregas contestadas</h2>
                    {disputes.map((x) => {
                        const ev = parseEvidence(x.evidence), st = proofStrength(ev)
                        return (
                            <div key={x.id} className="rounded-2xl p-3 flex flex-col gap-1.5" style={{ background: soft, border: x.status === 'open' ? `1.5px solid ${ORANGE}` : 'none' }}>
                                <p className="text-[13px] font-black" style={{ color: colors.textPrimary }}>{REASON_LABEL[x.reason]}{x.note ? ` — “${x.note}”` : ''}</p>
                                <p className="text-[11px]" style={{ color: st.level === 'strong' ? '#16a34a' : colors.textSecondary }}>Prova: {st.text}{ev.driverName ? ` (entregador: ${ev.driverName})` : ''}{ev.orderTotal != null ? ` · pedido ${brl(ev.orderTotal)}` : ''}</p>
                                {x.status === 'open' && (
                                    x.storeReply ? <p className="text-[12px]" style={{ color: colors.textSecondary }}>Você respondeu: “{x.storeReply}”. O iUser vai analisar.</p> : (
                                        <div className="flex gap-2 mt-1">
                                            <input value={note[x.id] || ''} onChange={(e) => setNote((n) => ({ ...n, [x.id]: e.target.value }))} placeholder="Sua versão (opcional ajuda o iUser)" maxLength={400} className="flex-1 min-w-0 h-10 px-3 rounded-full text-[13px] outline-none" style={{ background: colors.surface, color: colors.textPrimary }} />
                                            <button onClick={() => run(`r-${x.id}`, () => replyDispute(x.id, note[x.id] || ''), 'Resposta enviada.')} disabled={!(note[x.id] || '').trim() || busy === `r-${x.id}`} className="h-10 px-4 rounded-full text-[12.5px] font-black text-white disabled:opacity-40 active:scale-95" style={{ background: ORANGE }}>Enviar</button>
                                        </div>
                                    )
                                )}
                                {x.status === 'decided' && (
                                    <>
                                        <p className="text-[12px] font-black" style={{ color: colors.textPrimary }}>Decisão: {x.outcome ? OUTCOME_LABEL[x.outcome] : ''}{x.decisionNote ? ` — “${x.decisionNote}”` : ''}</p>
                                        {x.refundAmount != null && x.outcome !== 'rejected' && (
                                            <>
                                                <p className="text-[11px]" style={{ color: colors.textSecondary }}>{REFUND_LABEL[x.refundStatus]} · {brl(x.refundAmount)}{x.refundContested ? ' · o cliente diz que não recebeu' : ''}</p>
                                                {x.refundStatus === 'pending' && (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {REFUND_METHODS.map((m) => <button key={m.code} onClick={() => run(`f-${x.id}`, () => declareRefund(x.id, m.code), 'Reembolso declarado. O cliente vai confirmar.')} disabled={busy === `f-${x.id}`} className="h-8 px-3 rounded-full text-[11.5px] font-black text-white active:scale-95 disabled:opacity-50" style={{ background: ORANGE }}>Reembolsei por {m.label}</button>)}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        )
                    })}
                </>
            )}
        </section>
    )
}
