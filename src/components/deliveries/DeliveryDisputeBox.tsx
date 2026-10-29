// src/components/deliveries/DeliveryDisputeBox.tsx
//
// CONTESTAR a entrega (cliente, 2.0 e 3.0): "Não recebi meu pedido" vale por 24 h depois da entrega, MESMO com a prova do entregador — o iUser guarda as evidências (código usado, hora,
// distância), loja e entregador respondem e o admin decide. Se a decisão for a favor do cliente, a loja reembolsa por fora e o cliente confirma aqui. Regras no banco (migration 20261130000012).
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Gavel } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { toast } from '@/lib/toast'
import { brl, confirmRefund, fetchDisputeView, openDispute, OUTCOME_LABEL, REASONS, REFUND_LABEL, type DisputeReason, type DisputeView } from '@/modules/dues'

// O cartão do pedido é recriado a cada atualização da tela do carrinho: guarda a última resposta por pedido e não repete a consulta em < 5 s
const cache = new Map<string, { at: number; view: DisputeView | null }>()

export default function DeliveryDisputeBox({ orderId, light = false }: { orderId: string; light?: boolean }) {
    const { colors } = useTheme()
    const [view, setView] = useState<DisputeView | null>(() => cache.get(orderId)?.view ?? null)
    const [form, setForm] = useState(false)
    const [reason, setReason] = useState<DisputeReason>('not_received')
    const [note, setNote] = useState('')
    const [busy, setBusy] = useState(false)

    const load = useCallback(async (force = false) => {
        const hit = cache.get(orderId)
        if (!force && hit && Date.now() - hit.at < 5000) { setView(hit.view); return }
        const v = await fetchDisputeView(orderId)
        cache.set(orderId, { at: Date.now(), view: v })
        setView(v)
    }, [orderId])
    useEffect(() => { load() }, [load])

    const fg = light ? '#111827' : colors.textPrimary, sub = light ? '#6b7280' : colors.textSecondary
    const run = async (fn: () => Promise<void>, ok: string) => {
        setBusy(true)
        try { await fn(); toast.success(ok); setForm(false); await load(true) } catch (e: any) { toast.error(e?.message || 'Não deu certo.') } finally { setBusy(false) }
    }
    if (!view) return null

    if (!view.exists) {
        if (!view.canOpen) return null
        if (!form) return <button onClick={() => setForm(true)} className="mx-3.5 mb-3 text-[11.5px] font-bold underline self-start" style={{ color: sub }}>Não recebi meu pedido</button>
        return (
            <div className="mx-3.5 mb-3 rounded-2xl p-3 flex flex-col gap-2" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                <p className="text-[12px] font-black flex items-center gap-1.5" style={{ color: fg }}><Gavel size={13} /> O que aconteceu?</p>
                <div className="flex flex-wrap gap-1.5">
                    {REASONS.map((r) => <button key={r.code} onClick={() => setReason(r.code)} className="h-7 px-2.5 rounded-full text-[11px] font-black active:scale-95" style={reason === r.code ? { background: '#f97316', color: '#fff' } : { background: `${colors.border}60`, color: sub }}>{r.label}</button>)}
                </div>
                <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 400))} rows={2} placeholder="Conte o que houve (opcional)" className="rounded-xl p-2 text-[12.5px] outline-none resize-none" style={{ background: light ? '#fff' : colors.surface, color: fg, border: `1px solid ${colors.border}` }} />
                <p className="text-[10.5px]" style={{ color: sub }}>O iUser analisa as provas da entrega (código, hora e local). Contestar sem motivo pode travar novas contestações.</p>
                <div className="flex gap-2">
                    <button onClick={() => setForm(false)} className="h-9 px-4 rounded-full text-[12px] font-black active:scale-95" style={{ background: `${colors.border}60`, color: fg }}>Cancelar</button>
                    <button onClick={() => run(() => openDispute(orderId, reason, note), 'Contestação enviada. Vamos analisar.')} disabled={busy} className="h-9 px-4 rounded-full text-[12px] font-black text-white active:scale-95 disabled:opacity-50" style={{ background: '#ef4444' }}>Contestar entrega</button>
                </div>
            </div>
        )
    }

    // já contestada: onde está
    return (
        <div className="mx-3.5 mb-3 rounded-2xl p-3 flex flex-col gap-1.5" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
            <p className="text-[12px] font-black flex items-center gap-1.5" style={{ color: fg }}><Gavel size={13} /> Entrega contestada</p>
            {view.status === 'open' ? (
                <p className="text-[11.5px]" style={{ color: sub }}>O iUser está analisando as provas. Você recebe o resultado aqui e por aviso.</p>
            ) : (
                <>
                    <p className="text-[12px] font-bold" style={{ color: fg }}>Decisão: {view.outcome ? OUTCOME_LABEL[view.outcome] : ''}{view.decisionNote ? ` — “${view.decisionNote}”` : ''}</p>
                    {view.refundAmount != null && view.outcome !== 'rejected' && <p className="text-[11.5px]" style={{ color: sub }}>{REFUND_LABEL[view.refundStatus || 'none']} · {brl(view.refundAmount)}</p>}
                    {view.refundStatus === 'declared' && (
                        <div className="flex gap-2 mt-0.5">
                            <button onClick={() => run(() => confirmRefund(view.id as string, true), 'Obrigado por confirmar!')} disabled={busy} className="h-9 px-4 rounded-full text-[12px] font-black text-white active:scale-95 disabled:opacity-50" style={{ background: '#22c55e' }}>Recebi o reembolso</button>
                            <button onClick={() => run(() => confirmRefund(view.id as string, false), 'Avisei a loja.')} disabled={busy} className="h-9 px-4 rounded-full text-[12px] font-black active:scale-95 disabled:opacity-50" style={{ background: `${colors.border}60`, color: fg }}>Não recebi</button>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
