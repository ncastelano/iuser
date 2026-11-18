// src/components/deliveries/DuesBalances.tsx
//
// ACERTO PELO SALDO entre a loja e o entregador (18/11/2026; usado no Caixa do entregador e no Caixa das entregas da loja): o que ele deve à loja (dinheiro recebido
// na porta) e o que a loja deve a ele (fretes dos pedidos pagos direto à loja) se compensam. Quem deve o SALDO vê a chave Pix do outro, paga UMA vez e toca
// "Acertar"; saldo zero acerta na hora. Quem recebe confirma o acerto (ou contesta). O iUser só faz a conta das declarações (settle_dues_pair / confirm_dues_settlement).
'use client'

import { useState } from 'react'
import { ArrowLeftRight, Check, Copy } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { toast } from '@/lib/toast'
import { balanceSide, balanceText, brl, canSettle, confirmSettlement, fetchPairTarget, settlePair, SETTLEMENT_LABEL, type PairBalance, type Settlement } from '@/modules/dues'

const ORANGE = '#f97316', GREEN = '#22c55e', RED = '#ef4444'

export default function DuesBalances({ viewer, storeId, driverId, balances, settlements, onChanged }: {
    viewer: 'driver' | 'store'
    /** a loja (no caixa da loja) ou o entregador (no caixa dele): o outro lado vem em cada saldo */
    storeId?: string
    driverId?: string
    balances: PairBalance[]
    settlements: Settlement[]
    onChanged: () => void
}) {
    const { colors } = useTheme()
    const [busy, setBusy] = useState<string | null>(null)
    const [target, setTarget] = useState<{ key: string; name: string | null; pix: string | null; amount: number } | null>(null)
    const [refuse, setRefuse] = useState<string | null>(null)
    const [note, setNote] = useState('')
    const soft = `${colors.border}40`

    // vale o acerto quando há o que compensar ou mais de uma pendência com a mesma pessoa (uma pendência só se paga direto)
    const pairs = balances.filter((b) => b.items > 1 || (b.driverOwes > 0 && b.storeOwes > 0))
    // acertos que ESTA pessoa precisa confirmar (o outro lado pagou)
    const toConfirm = settlements.filter((t) => t.status === 'declared' && t.payer !== 'none' && t.payer !== viewer)
    const mine = settlements.filter((t) => t.status === 'declared' && t.payer === viewer)
    if (!pairs.length && !toConfirm.length && !mine.length) return null

    const pairIds = (b: PairBalance) => ({ s: storeId || b.storeId!, d: driverId || b.driverId! })
    const keyOf = (b: PairBalance) => `${b.storeId || storeId}:${b.driverId || driverId}`
    const run = async (k: string, fn: () => Promise<void>, ok: string) => {
        setBusy(k)
        try { await fn(); toast.success(ok); setTarget(null); setRefuse(null); setNote(''); onChanged() } catch (e: any) { toast.error(e?.message || 'Não deu certo.') } finally { setBusy(null) }
    }
    const openTarget = async (b: PairBalance) => {
        const { s, d } = pairIds(b)
        setBusy(`t-${keyOf(b)}`)
        try { const t = await fetchPairTarget(s, d); setTarget({ key: keyOf(b), name: t.payToName, pix: t.pixKey, amount: balanceSide(t).amount }) }
        catch (e: any) { toast.error(e?.message || 'Não consegui abrir.') } finally { setBusy(null) }
    }

    return (
        <div className="rounded-3xl p-4 flex flex-col gap-2.5" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            <div>
                <h2 className="text-base font-black flex items-center gap-1.5" style={{ color: colors.textPrimary }}><ArrowLeftRight size={16} style={{ color: ORANGE }} /> Acerto pelo saldo</h2>
                <p className="text-[11px]" style={{ color: colors.textSecondary }}>O dinheiro que {viewer === 'driver' ? 'você recebeu na porta' : 'o entregador recebeu na porta'} e os fretes que {viewer === 'driver' ? 'a loja te deve' : 'você deve'} se compensam: um Pix só, sem voltar à loja.</p>
            </div>

            {toConfirm.map((t) => (
                <div key={t.id} className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: soft, border: `1.5px solid ${ORANGE}` }}>
                    <p className="text-[13px] font-black" style={{ color: colors.textPrimary }}>
                        {viewer === 'store' ? (t.driverName?.split(' ')[0] || 'O entregador') : (t.storeName || 'A loja')} diz que te pagou o saldo de {brl(t.amount)}{t.method === 'pix' ? ' por Pix' : t.method === 'em_maos' ? ' em mãos' : ''}.
                    </p>
                    {refuse === t.id ? (
                        <div className="flex gap-2">
                            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="O que aconteceu?" maxLength={400} className="flex-1 min-w-0 h-10 px-3 rounded-full text-[13px] outline-none" style={{ background: colors.surface, color: colors.textPrimary }} />
                            <button onClick={() => run(`n-${t.id}`, () => confirmSettlement(t.id, false, note), 'Contestado. O iUser vai analisar.')} disabled={!note.trim() || busy === `n-${t.id}`} className="h-10 px-4 rounded-full text-[12.5px] font-black text-white disabled:opacity-40" style={{ background: RED }}>Enviar</button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => run(`c-${t.id}`, () => confirmSettlement(t.id, true), 'Acerto confirmado!')} disabled={busy === `c-${t.id}`} className="h-10 rounded-full text-[12.5px] font-black text-white disabled:opacity-50" style={{ background: GREEN }}>Recebi</button>
                            <button onClick={() => setRefuse(t.id)} className="h-10 rounded-full text-[12.5px] font-black" style={{ background: colors.surface, color: colors.textPrimary, border: `1.5px solid ${colors.border}` }}>Não recebi</button>
                        </div>
                    )}
                </div>
            ))}

            {mine.map((t) => (
                <p key={t.id} className="rounded-2xl px-3 py-2.5 text-[12px] font-bold" style={{ background: soft, color: colors.textSecondary }}>
                    Você pagou o saldo de {brl(t.amount)} a {viewer === 'driver' ? t.storeName : t.driverName?.split(' ')[0]}. {SETTLEMENT_LABEL[t.status]}.
                </p>
            ))}

            {pairs.map((b) => {
                const k = keyOf(b)
                const side = balanceSide(b)
                const can = canSettle(b, viewer)
                return (
                    <div key={k} className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: soft }}>
                        <p className="text-[13px] font-black leading-snug" style={{ color: colors.textPrimary }}>{balanceText(b, viewer)}</p>
                        {can && side.payer === 'none' && (
                            <button onClick={() => run(`s-${k}`, () => settlePair(pairIds(b).s, pairIds(b).d, 'pix').then(() => { }), 'Contas acertadas.')} disabled={busy === `s-${k}`} className="h-10 rounded-full text-[12.5px] font-black text-white disabled:opacity-50" style={{ background: GREEN }}>Acertar (nada a pagar)</button>
                        )}
                        {can && side.payer !== 'none' && (target?.key === k ? (
                            <div className="rounded-2xl p-2.5 flex flex-col gap-2" style={{ background: colors.surface }}>
                                {target.pix ? (
                                    <>
                                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>Pix para <b>{target.name}</b> · {brl(target.amount)}</p>
                                        <button onClick={() => { navigator.clipboard?.writeText(target.pix as string); toast.success('Chave copiada') }} className="h-9 px-3 rounded-full text-[12px] font-black flex items-center justify-center gap-1.5 break-all" style={{ background: soft, color: colors.textPrimary }}><Copy size={13} className="flex-shrink-0" /> {target.pix}</button>
                                    </>
                                ) : <p className="text-[11px] font-bold" style={{ color: colors.textSecondary }}>{target.name || 'O outro lado'} não cadastrou uma chave Pix: acerte em mãos.</p>}
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => run(`s-${k}`, () => settlePair(pairIds(b).s, pairIds(b).d, 'pix').then(() => { }), 'Pronto! Falta o outro lado confirmar.')} disabled={!target.pix || busy === `s-${k}`} className="h-10 rounded-full text-[12.5px] font-black text-white disabled:opacity-40" style={{ background: GREEN }}><Check size={14} className="inline mr-1" />Já fiz o Pix</button>
                                    <button onClick={() => run(`s-${k}`, () => settlePair(pairIds(b).s, pairIds(b).d, 'em_maos').then(() => { }), 'Pronto! Falta o outro lado confirmar.')} disabled={busy === `s-${k}`} className="h-10 rounded-full text-[12.5px] font-black disabled:opacity-40" style={{ background: colors.surface, color: colors.textPrimary, border: `1.5px solid ${colors.border}` }}>Paguei em mãos</button>
                                </div>
                            </div>
                        ) : (
                            <button onClick={() => openTarget(b)} disabled={busy === `t-${k}`} className="h-10 rounded-full text-[12.5px] font-black text-white disabled:opacity-50" style={{ background: ORANGE }}>Pagar o saldo de {brl(side.amount)}</button>
                        ))}
                        {!can && side.payer !== 'none' && <p className="text-[11px]" style={{ color: colors.textSecondary }}>Quando {viewer === 'driver' ? 'a loja' : 'o entregador'} pagar o saldo, você confirma aqui.</p>}
                    </div>
                )
            })}
        </div>
    )
}
