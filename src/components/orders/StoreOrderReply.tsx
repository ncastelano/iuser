// components/orders/StoreOrderReply.tsx — a LOJA responde um pedido novo antes de aceitar (22/11/2026, migration 092): escreve uma mensagem
// (ou toca numa pronta) que vai na conversa com o cliente, citando o pedido; o pedido fica "Combinando" até o cliente ajustar/concordar e a loja aceitar.
'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { MessageCircle, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import { storeReplyOrder } from '@/modules/order-payment'

const READY = ['Acabou um item do seu pedido. Quer trocar por outro?', 'O pedido vai demorar um pouco mais hoje, tudo bem?', 'Não entregamos nesse endereço, pode retirar na loja?', 'Pode confirmar o endereço de entrega?']

export default function StoreOrderReply({ orderId, buyer, onDone, compact = false }: { orderId: string; buyer?: string | null; onDone?: () => void; compact?: boolean }) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [text, setText] = useState('')
    const [busy, setBusy] = useState(false)
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])

    const send = async () => {
        if (text.trim().length < 2) { toast.error('Escreva a mensagem'); return }
        setBusy(true)
        try {
            const r = await storeReplyOrder(orderId, text)
            toast.success('Mensagem enviada', { description: 'O pedido fica "Combinando" até o cliente responder. Depois é só aceitar.', action: { label: 'Abrir conversa', onClick: () => router.push(`/conversas?sala=${encodeURIComponent(r.storeSlug)}&c=${r.conversationId}`) } })
            setOpen(false); setText(''); onDone?.()
            window.dispatchEvent(new Event('iuser-orders-changed'))
        } catch (e: any) { toast.error(e?.message || 'Não deu para enviar') } finally { setBusy(false) }
    }

    return (
        <>
            <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true) }} aria-label="Responder o pedido" title="Responder"
                className={compact ? 'w-9 h-9 rounded-full flex items-center justify-center transition active:scale-90' : 'h-10 px-4 rounded-full text-[13px] font-black flex items-center gap-1.5'}
                style={{ background: '#0ea5e918', color: '#0284c7' }}>
                <MessageCircle size={compact ? 16 : 15} />{!compact && 'Responder'}
            </button>
            {open && mounted && createPortal(
                <div className="fixed inset-0 z-[95] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => !busy && setOpen(false)}>
                    <div className="w-full max-w-lg rounded-t-3xl p-4 pb-6 bg-white text-gray-900" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                            <p className="flex-1 text-[15px] font-black">Responder {buyer ? `@${buyer}` : 'o cliente'} sobre o pedido</p>
                            <button onClick={() => setOpen(false)} aria-label="Fechar" className="w-9 h-9 rounded-full flex items-center justify-center bg-gray-100"><X size={16} /></button>
                        </div>
                        <p className="text-[12px] text-gray-500 mt-0.5">A mensagem vai na conversa. O cliente decide: pode tirar itens, mudar a quantidade ou dizer que está bom. Aí você aceita.</p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {READY.map((r) => <button key={r} onClick={() => setText(r)} className="px-3 py-1.5 rounded-full text-[12px] font-bold bg-gray-100 text-gray-700 text-left">{r}</button>)}
                        </div>
                        <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 600))} rows={3} placeholder="Escreva para o cliente…" className="mt-3 w-full rounded-2xl p-3 text-[14px] border border-gray-200 resize-none" autoFocus />
                        <button onClick={send} disabled={busy} className="mt-2 w-full h-11 rounded-full text-[14px] font-black text-white disabled:opacity-60" style={{ background: '#0284c7' }}>{busy ? 'Enviando…' : 'Enviar mensagem'}</button>
                    </div>
                </div>, document.body)}
        </>
    )
}
