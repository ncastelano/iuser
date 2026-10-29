// src/components/deliveries/DriverDues.tsx
//
// "Caixa" do ENTREGADOR (Central de entregas, 2.0 e 3.0): o dinheiro que recebeu na porta e deve repassar à loja (o frete é dele), a maquininha da loja que precisa devolver e as
// entregas contestadas que pedem resposta. O iUser não movimenta esse dinheiro: o entregador DECLARA ("repassei por Pix", "devolvi") e a loja confirma. Quem deixa vencer fica barrado
// de aceitar novas entregas (o banco recusa) — o aviso vermelho diz o motivo. Regras e prazos vêm do banco; aqui só se apresenta.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Banknote, Check, Copy, CreditCard, Gavel } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { toast } from '@/lib/toast'
import { brl, declareDue, dueAction, dueIn, fetchMyDisputes, fetchMyDues, fetchRemitTarget, proofStrength, parseEvidence, REASON_LABEL, replyDispute, type Due, type MyDispute, type MyDues } from '@/modules/dues'

const ORANGE = '#f97316', RED = '#ef4444', GREEN = '#22c55e'

export default function DriverDues() {
    const { colors } = useTheme()
    const [dues, setDues] = useState<MyDues | null>(null)
    const [disputes, setDisputes] = useState<MyDispute[]>([])
    const [busy, setBusy] = useState<string | null>(null)
    const [pix, setPix] = useState<{ id: string; key: string | null; store: string; amount: number } | null>(null)
    const [reply, setReply] = useState<Record<string, string>>({})

    const load = useCallback(async () => {
        const [d, ds] = await Promise.all([fetchMyDues().catch(() => null), fetchMyDisputes().catch(() => [] as MyDispute[])])
        setDues(d); setDisputes(ds.filter((x) => x.role === 'driver'))
    }, [])
    useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t) }, [load])

    const run = async (key: string, fn: () => Promise<void>, ok?: string) => {
        setBusy(key)
        try { await fn(); if (ok) toast.success(ok); setPix(null); await load() } catch (e: any) { toast.error(e?.message || 'Não deu certo.') } finally { setBusy(null) }
    }
    const openPix = async (d: Due) => {
        setBusy(`pixq-${d.id}`)
        try { const t = await fetchRemitTarget(d.id); setPix({ id: d.id, key: t.pixKey, store: t.storeName, amount: t.amount }) } catch (e: any) { toast.error(e?.message || 'Não consegui abrir.') } finally { setBusy(null) }
    }

    const items = dues?.items ?? []
    const openDisputes = disputes.filter((x) => x.status === 'open' || x.outcome === 'driver_at_fault')
    if (!dues || (items.length === 0 && openDisputes.length === 0 && !dues.blocked)) return null
    const soft = `${colors.border}40`

    return (
        <section className="flex flex-col gap-2.5">
            {dues.blocked && (
                <div className="rounded-3xl p-3.5 flex items-start gap-2.5" style={{ background: `${RED}14`, border: `1.5px solid ${RED}` }}>
                    <AlertTriangle size={18} style={{ color: RED }} className="flex-shrink-0 mt-0.5" />
                    <p className="text-[13px] font-bold" style={{ color: colors.textPrimary }}>{dues.blockedText} <span className="font-normal" style={{ color: colors.textSecondary }}>Enquanto isso, novas entregas ficam travadas.</span></p>
                </div>
            )}

            {items.length > 0 && (
                <div className="rounded-3xl p-4 flex flex-col gap-2.5" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                    <div className="flex items-end justify-between gap-2">
                        <div>
                            <h2 className="text-base font-black flex items-center gap-1.5" style={{ color: colors.textPrimary }}><Banknote size={16} style={{ color: ORANGE }} /> Caixa</h2>
                            <p className="text-[11px]" style={{ color: colors.textSecondary }}>O dinheiro da porta é da loja (o frete é seu): repasse e declare. A loja confirma.</p>
                        </div>
                        {dues.openAmount > 0 && <span className="text-[12px] font-black" style={{ color: dues.openAmount >= dues.maxOpen ? RED : ORANGE }}>{brl(dues.openAmount)} <span className="font-normal opacity-70">de {brl(dues.maxOpen)}</span></span>}
                    </div>
                    {items.map((d) => (
                        <div key={d.id} className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: soft, border: d.overdue || d.status === 'disputed' ? `1.5px solid ${RED}` : 'none' }}>
                            <div className="flex items-start gap-2.5">
                                <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: d.kind === 'machine' ? '#3b82f6' : d.kind === 'dispute_debt' ? RED : GREEN }}>{d.kind === 'machine' ? <CreditCard size={17} /> : <Banknote size={17} />}</span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[13px] font-black leading-tight" style={{ color: colors.textPrimary }}>{dueAction(d)}</p>
                                    <p className="text-[11px]" style={{ color: d.overdue ? RED : colors.textSecondary }}>{d.status === 'open' && d.dueAt ? `Prazo: ${dueIn(d.dueAt)}` : d.kind === 'machine' && d.status === 'open' ? 'O prazo começa quando acabar a última entrega no cartão.' : ''}{d.note && d.status === 'disputed' ? ` · “${d.note}”` : ''}</p>
                                </div>
                            </div>
                            {(d.status === 'open' || d.status === 'disputed') && (
                                d.kind === 'machine' ? (
                                    <button onClick={() => run(d.id, () => declareDue(d.id, 'devolvida'), 'Avisei a loja.')} disabled={busy === d.id} className="h-10 rounded-full text-[13px] font-black text-white active:scale-95 disabled:opacity-50" style={{ background: ORANGE }}>Devolvi a maquininha</button>
                                ) : pix?.id === d.id ? (
                                    <div className="rounded-2xl p-2.5 flex flex-col gap-2" style={{ background: colors.surface }}>
                                        {pix.key ? (
                                            <>
                                                <p className="text-[11px]" style={{ color: colors.textSecondary }}>Pix para <b>{pix.store}</b> · {brl(pix.amount)}</p>
                                                <button onClick={() => { navigator.clipboard?.writeText(pix.key as string); toast.success('Chave copiada') }} className="h-9 px-3 rounded-full text-[12px] font-black flex items-center justify-center gap-1.5 active:scale-95" style={{ background: soft, color: colors.textPrimary }}><Copy size={13} /> {pix.key}</button>
                                                <button onClick={() => run(d.id, () => declareDue(d.id, 'pix'), 'Pronto! A loja vai confirmar.')} disabled={busy === d.id} className="h-10 rounded-full text-[13px] font-black text-white active:scale-95 disabled:opacity-50" style={{ background: GREEN }}><Check size={14} className="inline mr-1" />Já fiz o Pix</button>
                                            </>
                                        ) : <p className="text-[11px] font-bold" style={{ color: colors.textSecondary }}>A loja não cadastrou uma chave Pix. Repasse em mãos.</p>}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-2">
                                        <button onClick={() => openPix(d)} disabled={busy === `pixq-${d.id}`} className="h-10 rounded-full text-[12.5px] font-black text-white active:scale-95 disabled:opacity-50" style={{ background: ORANGE }}>Repassar por Pix</button>
                                        <button onClick={() => run(d.id, () => declareDue(d.id, 'em_maos'), 'Pronto! A loja vai confirmar.')} disabled={busy === d.id} className="h-10 rounded-full text-[12.5px] font-black active:scale-95 disabled:opacity-50" style={{ background: colors.surface, color: colors.textPrimary, border: `1.5px solid ${colors.border}` }}>Entreguei em mãos</button>
                                    </div>
                                )
                            )}
                        </div>
                    ))}
                </div>
            )}

            {openDisputes.map((x) => {
                const ev = parseEvidence(x.evidence), st = proofStrength(ev)
                return (
                    <div key={x.id} className="rounded-3xl p-4 flex flex-col gap-2" style={{ background: colors.surface, border: `1.5px solid ${x.status === 'open' ? ORANGE : colors.border}` }}>
                        <p className="text-[11px] font-black uppercase flex items-center gap-1" style={{ color: ORANGE }}><Gavel size={12} /> Entrega contestada · {x.storeName}</p>
                        <p className="text-[13px] font-bold" style={{ color: colors.textPrimary }}>O cliente diz: {REASON_LABEL[x.reason]}{x.note ? ` — “${x.note}”` : ''}</p>
                        <p className="text-[11px]" style={{ color: st.level === 'strong' ? '#16a34a' : colors.textSecondary }}>Sua prova: {st.text}</p>
                        {x.status === 'open' ? (
                            x.driverReply ? <p className="text-[12px]" style={{ color: colors.textSecondary }}>Você respondeu: “{x.driverReply}”. O iUser vai analisar.</p> : (
                                <div className="flex gap-2">
                                    <input value={reply[x.id] || ''} onChange={(e) => setReply((r) => ({ ...r, [x.id]: e.target.value }))} placeholder="Conte o que aconteceu" maxLength={400} className="flex-1 min-w-0 h-10 px-3 rounded-full text-[13px] outline-none" style={{ background: soft, color: colors.textPrimary }} />
                                    <button onClick={() => run(`r-${x.id}`, () => replyDispute(x.id, reply[x.id] || ''), 'Resposta enviada.')} disabled={!(reply[x.id] || '').trim() || busy === `r-${x.id}`} className="h-10 px-4 rounded-full text-[12.5px] font-black text-white disabled:opacity-40 active:scale-95" style={{ background: ORANGE }}>Enviar</button>
                                </div>
                            )
                        ) : <p className="text-[12px] font-bold" style={{ color: colors.textPrimary }}>Decisão: {x.outcome === 'driver_at_fault' ? 'contra você — veja o valor devido no Caixa.' : 'sem culpa sua.'}{x.decisionNote ? ` “${x.decisionNote}”` : ''}</p>}
                    </div>
                )
            })}
        </section>
    )
}
