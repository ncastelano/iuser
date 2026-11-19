// src/components/orders/OrderPaymentCard.tsx
//
// PAGAR O PEDIDO DIRETO À LOJA (cliente; 18/11/2026). No pedido por Pix aparece o QR Pix DA PRÓPRIA LOJA com o valor exato (e o "copia e cola"); no pedido
// por cartão de uma loja com link, o botão "Pagar com cartão" (o link da conta dela). Depois a pessoa toca "Já paguei" e a loja confere e confirma.
// O dinheiro vai direto à loja: o iUser não toca nele, e o entregador não leva troco nem maquininha. Quem vê a chave e quem confirma é o banco
// (get_order_payment / report_order_paid, migration 20261130000074); aqui só se apresenta. Some sozinho quando não há pagamento antecipado.
'use client'

import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { CheckCircle2, Copy, CreditCard, Hourglass, QrCode, AlertTriangle } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { toast } from '@/lib/toast'
import { pixBrCode } from '@/lib/pixBrCode'
import { fetchOrderPayment, paymentStatusText, reportOrderPaid, type OrderPayment } from '@/modules/order-payment'

// o cartão do pedido da tela do carrinho é recriado a cada atualização dela: guarda a última resposta por pedido
const cache = new Map<string, { at: number; p: OrderPayment | null }>()
// o mesmo vale para o "Mostrar QR" aberto (senão ele fecha sozinho a cada atualização da tela)
const qrOpen = new Set<string>()
const TONE: Record<string, string> = { pending: '#f97316', check: '#0ea5e9', ok: '#16a34a', bad: '#dc2626' }

export default function OrderPaymentCard({ orderId, finished = false, paymentMethod }: { orderId: string; finished?: boolean; paymentMethod?: string | null }) {
    const { colors } = useTheme()
    const [p, setP] = useState<OrderPayment | null>(() => cache.get(orderId)?.p ?? null)
    const [qr, setQr] = useState<string | null>(null)
    const [showQr, setShowQrState] = useState(() => qrOpen.has(orderId))
    const setShowQr = (fn: (v: boolean) => boolean) => setShowQrState((v) => { const n = fn(v); if (n) qrOpen.add(orderId); else qrOpen.delete(orderId); return n })
    const [busy, setBusy] = useState(false)

    const load = async (force = false) => {
        const hit = cache.get(orderId)
        if (!force && hit && Date.now() - hit.at < 5000) { setP(hit.p); return }
        const v = await fetchOrderPayment(orderId)
        cache.set(orderId, { at: Date.now(), p: v })
        setP(v)
    }
    useEffect(() => {
        let alive = true
        const run = () => { if (alive) void load() }
        run()
        const t = finished ? null : setInterval(run, 15000)
        const onChange = () => { cache.delete(orderId); run() }
        window.addEventListener('iuser-orders-changed', onChange)
        return () => { alive = false; if (t) clearInterval(t); window.removeEventListener('iuser-orders-changed', onChange) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderId, finished])

    const brcode = useMemo(() => (p?.pixKey && p.method !== 'link_cartao' ? pixBrCode({ key: p.pixKey, keyType: p.pixKeyType, name: p.storeName, city: 'BRASIL', amount: p.amount, txid: p.txid || '***' }) : null), [p])
    useEffect(() => { if (showQr && brcode) QRCode.toDataURL(brcode, { margin: 1, width: 360 }).then(setQr).catch(() => setQr(null)) }, [showQr, brcode])

    // pedido por Pix numa loja ainda sem chave: avisa em vez de sumir
    if (!p?.method) {
        if (paymentMethod !== 'pix' || finished || !p) return null
        return (
            <div className="mx-3.5 mt-3 rounded-2xl px-3 py-2.5 text-[12px] font-bold flex items-center gap-2" style={{ background: '#f9731614', color: '#c2410c' }}>
                <AlertTriangle size={15} className="flex-shrink-0" /> A loja ainda não cadastrou a chave Pix: combine o pagamento pela conversa.
            </div>
        )
    }
    // pedido retido (esperando um entregador aceitar): ainda não se paga — se ninguém aceitar, ele é cancelado e não há o que devolver
    if (p.held && p.role === 'buyer' && !finished && p.status !== 'confirmed' && p.status !== 'reported') return (
        <div className="mx-3.5 mt-3 rounded-2xl px-3 py-2.5 text-[12px] font-bold flex items-start gap-2" style={{ background: `${colors.border}30`, color: colors.textSecondary }}>
            <Hourglass size={15} className="flex-shrink-0 mt-px" /> Pague depois: o Pix da loja aparece aqui assim que um entregador aceitar e a loja receber o pedido.
        </div>
    )
    const st = paymentStatusText(p)
    if (!st || (finished && p.status === 'confirmed')) return null
    const color = TONE[st.tone]
    const canPay = p.role === 'buyer' && (p.status === 'awaiting' || p.status === 'not_received') && p.method !== 'pix_porta'

    const copy = async () => {
        if (!brcode) return
        try { await navigator.clipboard.writeText(brcode); toast.success('Código Pix copiado', { description: 'Cole no app do seu banco, na opção Pix copia e cola.' }) }
        catch { toast.error('Não deu para copiar. Toque em "Mostrar QR" e leia com o app do banco.') }
    }
    const paid = async () => {
        setBusy(true)
        try { await reportOrderPaid(orderId); cache.delete(orderId); await load(true); toast.success('Avisamos a loja', { description: 'Ela confere na conta e confirma.' }) }
        catch (e: any) { toast.error(e?.message || 'Não deu para avisar. Tente de novo.') }
        finally { setBusy(false) }
    }

    return (
        <div className="mx-3.5 mt-3 rounded-2xl p-3" style={{ background: `${color}12`, border: `1px solid ${color}40` }}>
            <p className="flex items-start gap-2 text-[12.5px] font-black leading-snug" style={{ color }}>
                {st.tone === 'ok' ? <CheckCircle2 size={16} className="flex-shrink-0 mt-px" /> : st.tone === 'check' ? <Hourglass size={16} className="flex-shrink-0 mt-px" /> : st.tone === 'bad' ? <AlertTriangle size={16} className="flex-shrink-0 mt-px" /> : p.method === 'link_cartao' ? <CreditCard size={16} className="flex-shrink-0 mt-px" /> : <QrCode size={16} className="flex-shrink-0 mt-px" />}
                <span>{st.text}</span>
            </p>
            {canPay && (
                <>
                    {p.method === 'link_cartao' ? (
                        p.cardLink && <a href={p.cardLink} target="_blank" rel="noopener noreferrer" className="mt-2.5 h-11 rounded-full flex items-center justify-center gap-2 text-[13px] font-black text-white" style={{ background: '#f97316' }}><CreditCard size={16} /> Pagar com cartão</a>
                    ) : brcode && (
                        <>
                            <p className="mt-1.5 text-[11.5px]" style={{ color: colors.textSecondary }}>O dinheiro vai direto para a conta da loja. Ninguém leva troco nem maquininha.</p>
                            <div className="mt-2.5 grid grid-cols-2 gap-2">
                                <button onClick={copy} className="h-11 rounded-full flex items-center justify-center gap-1.5 text-[12.5px] font-black text-white" style={{ background: '#f97316' }}><Copy size={15} /> Copiar Pix</button>
                                <button onClick={() => setShowQr((v) => !v)} className="h-11 rounded-full flex items-center justify-center gap-1.5 text-[12.5px] font-black" style={{ background: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}` }}><QrCode size={15} /> {showQr ? 'Esconder QR' : 'Mostrar QR'}</button>
                            </div>
                            {showQr && qr && <img src={qr} alt="QR Pix da loja" className="mt-2.5 mx-auto w-48 h-48 rounded-xl bg-white p-1.5" />}
                        </>
                    )}
                    <button onClick={paid} disabled={busy} className="mt-2 w-full h-10 rounded-full text-[12.5px] font-black disabled:opacity-60" style={{ background: '#16a34a1a', color: '#16a34a' }}>{busy ? 'Avisando…' : 'Já paguei'}</button>
                </>
            )}
        </div>
    )
}
