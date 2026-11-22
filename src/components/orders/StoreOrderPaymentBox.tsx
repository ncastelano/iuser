// src/components/orders/StoreOrderPaymentBox.tsx
//
// A LOJA confere o pagamento que o cliente fez direto na conta dela (Pix com o QR da loja, link de cartão ou Pix na porta mostrado pelo entregador; 18/11/2026):
// a frase do estado e os botões "Recebi" / "Não recebi" (com o motivo). Vai dentro da janela do pedido (OrderModal). Quem pode confirmar é o banco
// (confirm_order_payment: dona ou funcionário da loja). Pedido sem pagamento antecipado: não aparece.
'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Wallet, FileText } from 'lucide-react'
import { toast } from '@/lib/toast'
import { confirmOrderPayment, fetchOrderPayment, paymentStatusText, receiptUrl, type OrderPayment } from '@/modules/order-payment'

const TONE: Record<string, [string, string, string]> = { pending: ['#c2410c', '#f9731614', '#f9731640'], check: ['#0369a1', '#0ea5e914', '#0ea5e940'], ok: ['#15803d', '#16a34a14', '#16a34a40'], bad: ['#b91c1c', '#ef444414', '#ef444440'] }

export default function StoreOrderPaymentBox({ orderId }: { orderId: string }) {
    const [p, setP] = useState<OrderPayment | null>(null)
    const [busy, setBusy] = useState(false)
    const [asking, setAsking] = useState(false)
    const [note, setNote] = useState('')
    const load = () => fetchOrderPayment(orderId).then(setP)
    useEffect(() => {
        let alive = true
        fetchOrderPayment(orderId).then((v) => { if (alive) setP(v) })
        const on = () => { void load() }
        window.addEventListener('iuser-orders-changed', on)
        return () => { alive = false; window.removeEventListener('iuser-orders-changed', on) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderId])
    if (!p || p.role !== 'store') return null
    const st = paymentStatusText(p)
    if (!st) return null
    const [fg, bg, bd] = TONE[st.tone]

    const decide = async (ok: boolean) => {
        if (!ok && !note.trim()) { setAsking(true); return }
        setBusy(true)
        try {
            await confirmOrderPayment(orderId, ok, ok ? undefined : note.trim())
            toast.success(ok ? 'Pagamento confirmado' : 'Avisamos o cliente')
            setAsking(false); setNote('')
            await load()
            window.dispatchEvent(new Event('iuser-orders-changed'))
        } catch (e: any) { toast.error(e?.message || 'Não deu certo. Tente de novo.') }
        finally { setBusy(false) }
    }

    return (
        <div className="rounded-xl p-3 border" style={{ color: fg, background: bg, borderColor: bd }}>
            <div className="flex items-center gap-2">
                {st.tone === 'ok' ? <CheckCircle2 size={14} /> : <Wallet size={14} />}
                <span className="text-[10px] font-black uppercase tracking-wider">Pagamento direto à loja</span>
            </div>
            <p className="text-sm font-bold mt-1 text-gray-800">{st.text}</p>
            {(p.payerName || p.payerBank || p.payerE2e || p.receiptPath) && (
                <div className="mt-2 rounded-lg bg-white/80 p-2.5 text-[12px] text-gray-700 flex flex-col gap-0.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Quem pagou (o cliente informou)</span>
                    {p.payerName && <span><b>Nome:</b> {p.payerName}</span>}
                    {p.payerBank && <span><b>Banco:</b> {p.payerBank}</span>}
                    {p.payerE2e && <span className="break-all"><b>ID da transação:</b> {p.payerE2e}</span>}
                    {p.receiptPath && (
                        <button onClick={async () => { const u = await receiptUrl(p.receiptPath!); if (u) window.open(u, '_blank', 'noopener'); else toast.error('Não deu para abrir o comprovante.') }}
                            className="mt-1.5 h-9 rounded-lg text-[12.5px] font-black flex items-center justify-center gap-1.5 text-white" style={{ background: '#0ea5e9' }}>
                            <FileText size={14} /> Ver comprovante
                        </button>
                    )}
                    <span className="text-[10.5px] text-gray-500 mt-1">O comprovante ajuda a achar o Pix, mas confirme olhando a sua conta.</span>
                </div>
            )}
            {(p.status === 'reported' || p.status === 'awaiting' || p.status === 'not_received') && (
                <>
                    {p.status !== 'reported' && <p className="text-[11px] mt-1 text-gray-600">Quando o dinheiro cair na sua conta, confirme aqui.</p>}
                    {asking && (
                        <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder="O que aconteceu? (ex.: não caiu na conta)" className="mt-2 w-full h-10 px-3 rounded-lg text-sm border border-gray-300 text-gray-800 bg-white" autoFocus />
                    )}
                    <div className="mt-2 grid grid-cols-2 gap-2">
                        <button onClick={() => decide(true)} disabled={busy} className="h-10 rounded-lg text-[13px] font-black text-white disabled:opacity-60" style={{ background: '#16a34a' }}>Recebi</button>
                        <button onClick={() => decide(false)} disabled={busy || p.status === 'not_received' && !asking} className="h-10 rounded-lg text-[13px] font-black border border-gray-300 text-gray-700 bg-white disabled:opacity-60">{asking ? 'Enviar' : 'Não recebi'}</button>
                    </div>
                </>
            )}
        </div>
    )
}
