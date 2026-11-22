// src/components/orders/OrderPaymentCard.tsx
//
// PAGAR O PEDIDO DIRETO À LOJA (cliente; 18/11/2026). No pedido por Pix aparece o QR Pix DA PRÓPRIA LOJA com o valor exato (e o "copia e cola"); no pedido
// por cartão de uma loja com link, o botão "Pagar com cartão" (o link da conta dela). Depois a pessoa toca "Já paguei" e a loja confere e confirma.
// O dinheiro vai direto à loja: o iUser não toca nele, e o entregador não leva troco nem maquininha. Quem vê a chave e quem confirma é o banco
// (get_order_payment / report_order_paid, migration 20261130000074); aqui só se apresenta. Some sozinho quando não há pagamento antecipado.
'use client'

import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { CheckCircle2, Copy, CreditCard, Hourglass, QrCode, AlertTriangle, Paperclip, FileText } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { toast } from '@/lib/toast'
import { pixBrCode } from '@/lib/pixBrCode'
import { fetchOrderPayment, paymentStatusText, receiptUrl, reportOrderPaid, type OrderPayment } from '@/modules/order-payment'

// o cartão do pedido da tela do carrinho é recriado a cada atualização dela: guarda a última resposta por pedido
const cache = new Map<string, { at: number; p: OrderPayment | null }>()
// o mesmo vale para o "Mostrar QR" aberto (senão ele fecha sozinho a cada atualização da tela)
const qrOpen = new Set<string>()
// o formulário do "Já paguei" também sobrevive à recriação do cartão (aberto, campos e o arquivo escolhido)
const forms = new Map<string, { payer: string; bank: string; e2e: string; file: File | null }>()
const TONE: Record<string, string> = { pending: '#f97316', check: '#0ea5e9', ok: '#16a34a', bad: '#dc2626' }

export default function OrderPaymentCard({ orderId, finished = false, paymentMethod }: { orderId: string; finished?: boolean; paymentMethod?: string | null }) {
    const { colors } = useTheme()
    const [p, setP] = useState<OrderPayment | null>(() => cache.get(orderId)?.p ?? null)
    const [qr, setQr] = useState<string | null>(null)
    const [showQr, setShowQrState] = useState(() => qrOpen.has(orderId))
    const setShowQr = (fn: (v: boolean) => boolean) => setShowQrState((v) => { const n = fn(v); if (n) qrOpen.add(orderId); else qrOpen.delete(orderId); return n })
    const [busy, setBusy] = useState(false)
    // "Já paguei" abre o formulário: comprovante (opcional) e quem pagou — ajuda a loja a achar o Pix na conta dela (migration 091)
    const saved = forms.get(orderId)
    const [form, setFormState] = useState(!!saved)
    const [payer, setPayer] = useState(saved?.payer ?? '')
    const [bank, setBank] = useState(saved?.bank ?? '')
    const [e2e, setE2e] = useState(saved?.e2e ?? '')
    const [file, setFile] = useState<File | null>(saved?.file ?? null)
    const setForm = (v: boolean) => { setFormState(v); if (v) forms.set(orderId, { payer, bank, e2e, file }); else forms.delete(orderId) }
    useEffect(() => { if (form) forms.set(orderId, { payer, bank, e2e, file }) }, [form, payer, bank, e2e, file, orderId])

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
    const openForm = () => setForm(true)
    const paid = async () => {
        setBusy(true)
        try {
            await reportOrderPaid(orderId, { payerName: payer, payerBank: bank, e2e, receipt: file })
            cache.delete(orderId); setForm(false); setFile(null); await load(true)
            toast.success('Avisamos a loja', { description: file ? 'Ela vê o seu comprovante, confere na conta e confirma.' : 'Ela confere na conta e confirma.' })
        }
        catch (e: any) { toast.error(e?.message || 'Não deu para avisar. Tente de novo.') }
        finally { setBusy(false) }
    }

    return (
        <div className="mx-3.5 mt-3 rounded-2xl p-3" style={{ background: `${color}12`, border: `1px solid ${color}40` }}>
            <p className="flex items-start gap-2 text-[12.5px] font-black leading-snug" style={{ color }}>
                {st.tone === 'ok' ? <CheckCircle2 size={16} className="flex-shrink-0 mt-px" /> : st.tone === 'check' ? <Hourglass size={16} className="flex-shrink-0 mt-px" /> : st.tone === 'bad' ? <AlertTriangle size={16} className="flex-shrink-0 mt-px" /> : p.method === 'link_cartao' ? <CreditCard size={16} className="flex-shrink-0 mt-px" /> : <QrCode size={16} className="flex-shrink-0 mt-px" />}
                <span>{st.text}</span>
            </p>
            {p.role === 'buyer' && (p.payerName || p.receiptPath) && !canPay && (
                <p className="mt-1.5 text-[11.5px] flex items-center gap-1.5 flex-wrap" style={{ color: colors.textSecondary }}>
                    {p.payerName && <span>Pago por {p.payerName}{p.payerBank ? ` · ${p.payerBank}` : ''}</span>}
                    {p.receiptPath && <button onClick={async () => { const u = await receiptUrl(p.receiptPath!); if (u) window.open(u, '_blank', 'noopener'); else toast.error('Não deu para abrir o comprovante.') }} className="font-black underline">Ver comprovante</button>}
                </p>
            )}
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
                    {!form ? (
                        <button onClick={openForm} className="mt-2 w-full h-10 rounded-full text-[12.5px] font-black" style={{ background: '#16a34a1a', color: '#16a34a' }}>Já paguei</button>
                    ) : (
                        <div className="mt-2.5 rounded-2xl p-3 flex flex-col gap-2" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                            <p className="text-[12px] font-black" style={{ color: colors.textPrimary }}>Ajude a loja a achar o seu Pix</p>
                            <label className="h-11 rounded-xl flex items-center gap-2 px-3 text-[12.5px] font-bold cursor-pointer" style={{ background: `${colors.border}30`, color: colors.textPrimary }}>
                                {file?.type === 'application/pdf' ? <FileText size={16} /> : <Paperclip size={16} />}
                                <span className="truncate flex-1">{file ? file.name : 'Anexar o comprovante do banco (foto ou PDF)'}</span>
                                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                            </label>
                            <input value={payer} onChange={(e) => setPayer(e.target.value.slice(0, 80))} placeholder="Nome de quem pagou (titular da conta)" className="h-10 px-3 rounded-xl text-[13px]" style={{ background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary }} />
                            <div className="grid grid-cols-2 gap-2">
                                <input value={bank} onChange={(e) => setBank(e.target.value.slice(0, 60))} placeholder="Banco (ex.: Nubank)" className="h-10 px-3 rounded-xl text-[13px] min-w-0" style={{ background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary }} />
                                <input value={e2e} onChange={(e) => setE2e(e.target.value.replace(/[^A-Za-z0-9-]/g, '').slice(0, 40))} placeholder="ID da transação (opcional)" className="h-10 px-3 rounded-xl text-[13px] min-w-0" style={{ background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary }} />
                            </div>
                            <p className="text-[11px]" style={{ color: colors.textSecondary }}>Tudo é opcional. Só a loja deste pedido vê. Quem confirma o pagamento é a loja, olhando a conta dela.</p>
                            <div className="grid grid-cols-[1fr_auto] gap-2">
                                <button onClick={paid} disabled={busy} className="h-10 rounded-full text-[12.5px] font-black text-white disabled:opacity-60" style={{ background: '#16a34a' }}>{busy ? 'Enviando…' : 'Avisar a loja'}</button>
                                <button onClick={() => setForm(false)} className="h-10 px-4 rounded-full text-[12.5px] font-bold" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>Voltar</button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
