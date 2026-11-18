// src/components/deliveries/DeliveryPayBox.tsx
//
// O PAGAMENTO na porta, para o ENTREGADOR (Central/Percurso; 18/11/2026). Mostra o que a corrida diz (Pix pago à loja, dinheiro com troco, cartão) e, quando o
// cliente pagou ANTES direto à loja (Pix com o QR dela ou o link de cartão), diz "não cobre nada". No pedido em dinheiro ou cartão, o botão "Cobrar com o Pix da loja"
// mostra o QR Pix DA LOJA com o valor exato: o cliente paga a loja ali e o entregador não pega dinheiro nem leva maquininha (start_door_pix / driver_report_door_pix,
// migration 20261130000074). A loja confere o Pix e o frete dessa entrega fica como dívida DELA com o entregador.
'use client'

import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { CheckCircle2, QrCode, X } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { toast } from '@/lib/toast'
import { pixBrCode } from '@/lib/pixBrCode'
import { paymentRecap } from '@/modules/deliveries'
import { canDoorPix, fetchOrderPayment, paymentStatusText, reportDoorPix, startDoorPix, type OrderPayment } from '@/modules/order-payment'

const GREEN = '#22c55e'

export default function DeliveryPayBox({ rideId, orderId, paymentMethod, cashChangeFor, pickedUp }: { rideId: string; orderId: string; paymentMethod: string | null; cashChangeFor: number | null; pickedUp: boolean }) {
    const { colors } = useTheme()
    const [p, setP] = useState<OrderPayment | null>(null)
    const [door, setDoor] = useState<{ pixKey: string; pixKeyType: string | null; amount: number; storeName: string; txid: string } | null>(null)
    const [qr, setQr] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    useEffect(() => {
        let alive = true
        const run = () => fetchOrderPayment(orderId).then((v) => { if (alive) setP(v) })
        run()
        const t = setInterval(run, 15000)
        return () => { alive = false; clearInterval(t) }
    }, [orderId])
    const brcode = useMemo(() => (door ? pixBrCode({ key: door.pixKey, keyType: door.pixKeyType, name: door.storeName, city: 'BRASIL', amount: door.amount, txid: door.txid }) : null), [door])
    useEffect(() => { if (brcode) QRCode.toDataURL(brcode, { margin: 1, width: 400 }).then(setQr).catch(() => setQr(null)) }, [brcode])

    const recap = paymentRecap(paymentMethod, cashChangeFor)
    const st = p?.method ? paymentStatusText(p) : null
    const paidBefore = p?.status === 'reported' || p?.status === 'confirmed'
    const collect = recap.collect && !paidBefore
    const showDoor = canDoorPix(paymentMethod, pickedUp, p?.status ?? null) && !(p?.method === 'pix_porta' && paidBefore)

    const open = async () => {
        setBusy(true)
        try { setDoor(await startDoorPix(rideId)) } catch (e: any) { toast.error(e?.message || 'Não deu para abrir o Pix da loja') } finally { setBusy(false) }
    }
    const paid = async () => {
        setBusy(true)
        try { await reportDoorPix(rideId); toast.success('Avisamos a loja', { description: 'Ela confere o Pix. O frete desta entrega fica com a loja para te pagar.' }); setDoor(null); setP(await fetchOrderPayment(orderId)) }
        catch (e: any) { toast.error(e?.message || 'Não deu certo. Tente de novo.') }
        finally { setBusy(false) }
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="rounded-2xl px-3 py-2 text-[12px] font-bold" style={collect ? { background: '#f59e0b22', color: '#b45309' } : { background: `${GREEN}22`, color: '#16a34a' }}>
                {st && paidBefore ? st.text : <>{recap.label}{recap.note ? ` · ${recap.note}` : ''}</>}
            </div>
            {showDoor && !door && (
                <button onClick={open} disabled={busy} className="h-10 rounded-full text-[12.5px] font-black flex items-center justify-center gap-1.5 disabled:opacity-60" style={{ background: colors.surface, color: colors.textPrimary, border: `1.5px solid ${colors.border}` }}>
                    <QrCode size={15} /> Cobrar com o Pix da loja (sem troco nem maquininha)
                </button>
            )}
            {door && (
                <div className="rounded-2xl p-3 flex flex-col items-center gap-2" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                    <div className="w-full flex items-center justify-between">
                        <p className="text-[12px] font-black" style={{ color: colors.textPrimary }}>Pix da {door.storeName} · R$ {door.amount.toFixed(2).replace('.', ',')}</p>
                        <button onClick={() => setDoor(null)} aria-label="Fechar" className="w-8 h-8 rounded-full flex items-center justify-center" style={{ color: colors.textSecondary }}><X size={16} /></button>
                    </div>
                    {qr ? <img src={qr} alt="QR Pix da loja" className="w-56 h-56 rounded-xl bg-white p-2" /> : <div className="w-56 h-56 rounded-xl" style={{ background: `${colors.border}40` }} />}
                    <p className="text-[11px] text-center" style={{ color: colors.textSecondary }}>Mostre ao cliente: ele lê com o app do banco e paga direto à loja. Confira a tela de "pago" dele.</p>
                    <button onClick={paid} disabled={busy} className="w-full h-11 rounded-full text-[13px] font-black text-white flex items-center justify-center gap-1.5 disabled:opacity-60" style={{ background: GREEN }}><CheckCircle2 size={16} /> O cliente pagou</button>
                </div>
            )}
        </div>
    )
}
