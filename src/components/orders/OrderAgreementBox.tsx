// components/orders/OrderAgreementBox.tsx — o CLIENTE e o pedido ainda não aceito (22/11/2026, migration 092): a loja pode ter respondido;
// é ele quem decide o pedido — tira itens, muda a quantidade (o banco recalcula) e diz "Está bom assim". O Pix só aparece depois do aceite.
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, Minus, Plus, Trash2, CheckCircle2, Pencil } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { toast } from '@/lib/toast'
import { supabase } from '@/lib/supabase/client'
import { customerAdjustOrder, customerAgreeOrder, brl } from '@/modules/order-payment'

type Line = { id: string; product_name: string; quantity: number; unit_price: number }
type Info = { replied: string | null; agreed: string | null; lines: Line[] }
const cache = new Map<string, Info>()
const editing = new Set<string>()
const drafts = new Map<string, Record<string, number>>()   // as quantidades mexidas sobrevivem à recriação do cartão

export default function OrderAgreementBox({ orderId }: { orderId: string }) {
    const router = useRouter()
    const { colors } = useTheme()
    const [info, setInfo] = useState<Info | null>(() => cache.get(orderId) ?? null)
    const [edit, setEditState] = useState(() => editing.has(orderId))
    const setEdit = (v: boolean) => { setEditState(v); if (v) editing.add(orderId); else { editing.delete(orderId); drafts.delete(orderId) } }
    const [qty, setQtyState] = useState<Record<string, number>>(() => drafts.get(orderId) ?? {})
    const setQty = (v: Record<string, number>) => { setQtyState(v); drafts.set(orderId, v) }
    const [busy, setBusy] = useState(false)

    const load = async () => {
        const [{ data: o }, { data: items }] = await Promise.all([
            supabase.from('orders').select('store_replied_at, customer_agreed_at').eq('id', orderId).maybeSingle(),
            supabase.from('order_items').select('id, product_name, quantity, unit_price').eq('order_id', orderId),
        ])
        const v = { replied: (o as any)?.store_replied_at ?? null, agreed: (o as any)?.customer_agreed_at ?? null, lines: (items || []) as Line[] }
        cache.set(orderId, v); setInfo(v)
    }
    useEffect(() => {
        void load()
        const on = () => void load()
        window.addEventListener('iuser-orders-changed', on)
        const t = setInterval(on, 15000)
        return () => { window.removeEventListener('iuser-orders-changed', on); clearInterval(t) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderId])
    if (!info) return null

    const q = (l: Line) => qty[l.id] ?? l.quantity
    const changed = info.lines.filter((l) => q(l) !== l.quantity)
    const save = async () => {
        if (!changed.length) { setEdit(false); return }
        if (info.lines.every((l) => q(l) === 0)) { toast.error('Deixe pelo menos um item. Para desistir, cancele o pedido.'); return }
        setBusy(true)
        try { const t = await customerAdjustOrder(orderId, changed.map((l) => ({ id: l.id, quantity: q(l) }))); toast.success('Pedido ajustado', { description: `Novo total: ${brl(t)}. A loja foi avisada.` }); setEdit(false); setQty({}); await load(); window.dispatchEvent(new Event('iuser-orders-changed')) }
        catch (e: any) { toast.error(e?.message || 'Não deu para ajustar') } finally { setBusy(false) }
    }
    const agree = async () => {
        setBusy(true)
        try { await customerAgreeOrder(orderId); toast.success('Avisamos a loja', { description: 'Quando ela aceitar, o Pix aparece aqui.' }); await load() }
        catch (e: any) { toast.error(e?.message || 'Não deu certo') } finally { setBusy(false) }
    }

    return (
        <div className="mx-3.5 mt-3 rounded-2xl p-3" style={{ background: info.replied ? '#0ea5e912' : `${colors.border}25`, border: `1px solid ${info.replied ? '#0ea5e940' : colors.border}` }}>
            <p className="text-[12.5px] font-black flex items-start gap-2" style={{ color: info.replied ? '#0369a1' : colors.textPrimary }}>
                {info.agreed ? <CheckCircle2 size={16} className="flex-shrink-0 mt-px text-green-600" /> : <MessageCircle size={16} className="flex-shrink-0 mt-px" />}
                <span>{info.agreed ? 'Você disse que está bom assim. Falta a loja aceitar.' : info.replied ? 'A loja respondeu sobre o seu pedido. Veja a mensagem e decida.' : 'Esperando a loja aceitar ou responder. Até lá você ainda pode mudar o pedido.'}</span>
            </p>
            {info.replied && <button onClick={() => router.push('/conversas')} className="mt-2 h-9 px-3 rounded-full text-[12px] font-black flex items-center gap-1.5" style={{ background: '#0ea5e9', color: '#fff' }}><MessageCircle size={14} /> Abrir conversa</button>}
            {edit ? (
                <div className="mt-2.5 flex flex-col gap-1.5">
                    {info.lines.map((l) => (
                        <div key={l.id} className="flex items-center gap-2 rounded-xl px-2.5 py-1.5" style={{ background: colors.surface, opacity: q(l) === 0 ? 0.5 : 1 }}>
                            <span className="flex-1 min-w-0 text-[12.5px] font-bold truncate" style={{ color: colors.textPrimary, textDecoration: q(l) === 0 ? 'line-through' : undefined }}>{l.product_name}</span>
                            <span className="text-[11.5px]" style={{ color: colors.textSecondary }}>{brl(l.unit_price * q(l))}</span>
                            <button onClick={() => setQty({ ...qty, [l.id]: Math.max(0, q(l) - 1) })} aria-label="Menos" className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: `${colors.border}50`, color: colors.textPrimary }}>{q(l) <= 1 ? <Trash2 size={13} /> : <Minus size={13} />}</button>
                            <span className="w-5 text-center text-[13px] font-black" style={{ color: colors.textPrimary }}>{q(l)}</span>
                            <button onClick={() => setQty({ ...qty, [l.id]: Math.min(50, q(l) + 1) })} aria-label="Mais" className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: `${colors.border}50`, color: colors.textPrimary }}><Plus size={13} /></button>
                        </div>
                    ))}
                    <div className="grid grid-cols-[1fr_auto] gap-2 mt-1">
                        <button onClick={save} disabled={busy} className="h-10 rounded-full text-[12.5px] font-black text-white disabled:opacity-60" style={{ background: '#f97316' }}>{busy ? 'Salvando…' : changed.length ? 'Salvar mudanças' : 'Fechar'}</button>
                        <button onClick={() => { setEdit(false); setQty({}) }} className="h-10 px-4 rounded-full text-[12.5px] font-bold" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>Voltar</button>
                    </div>
                </div>
            ) : (
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <button onClick={() => setEdit(true)} className="h-10 rounded-full text-[12.5px] font-black flex items-center justify-center gap-1.5" style={{ background: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}` }}><Pencil size={14} /> Mudar pedido</button>
                    <button onClick={agree} disabled={busy || !!info.agreed} className="h-10 rounded-full text-[12.5px] font-black text-white disabled:opacity-50" style={{ background: '#16a34a' }}>{info.agreed ? 'De acordo ✓' : 'Está bom assim'}</button>
                </div>
            )}
        </div>
    )
}
