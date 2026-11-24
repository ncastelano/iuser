// components/store/PrivateStoreGate.tsx — a PORTA de uma loja privada (23/11/2026, decisão do dono): quem não é cliente aprovado não vê
// nem o nome nem o logo da loja; só pode pedir para ser cliente. O banco decide tudo (get_private_store_gate / request_store_access).
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Clock, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { toast } from '@/lib/toast'

export interface PrivateGate { store_id: string; visible: boolean; status: 'pending' | 'approved' | 'rejected' | 'removed' | null }

export default function PrivateStoreGate({ gate, colors }: { gate: PrivateGate; colors: any }) {
    const router = useRouter()
    const { userId } = useProfile()
    const [status, setStatus] = useState(gate.status)
    const [note, setNote] = useState('')
    const [busy, setBusy] = useState(false)
    const send = async () => {
        if (!userId) { router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`); return }
        setBusy(true)
        const { data, error } = await supabase.rpc('request_store_access', { p_store: gate.store_id, p_note: note.trim() || null })
        setBusy(false)
        if (error) { toast.error(error.message); return }
        setStatus(((data as any)?.status) || 'pending')
        if ((data as any)?.status === 'approved') window.location.reload()
        else toast.success('Pedido enviado. A loja vai responder.')
    }
    return (
        <div className="min-h-[70vh] flex items-center justify-center px-5" style={{ paddingTop: 'var(--shell-top,0px)' }}>
            <div className="w-full max-w-sm rounded-[28px] p-6 text-center" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                <span className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center text-white" style={{ background: 'linear-gradient(135deg,#f97316,#dc2626)' }}><Lock size={28} /></span>
                <h1 className="mt-4 text-[20px] font-black" style={{ color: colors.textPrimary }}>Loja privada</h1>
                {status === 'pending' ? (
                    <>
                        <p className="mt-2 text-[13.5px] leading-snug" style={{ color: colors.textSecondary }}>Seu pedido foi enviado. Quando a loja aceitar, você verá tudo o que ela oferece por este mesmo link.</p>
                        <p className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-black px-3 h-9 rounded-full" style={{ background: '#eab3081f', color: '#a16207' }}><Clock size={15} /> Aguardando a loja</p>
                    </>
                ) : status === 'approved' ? (
                    <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-black" style={{ color: '#16a34a' }}><CheckCircle2 size={15} /> Você é cliente. Recarregue a página.</p>
                ) : (
                    <>
                        <p className="mt-2 text-[13.5px] leading-snug" style={{ color: colors.textSecondary }}>
                            {status === 'rejected' || status === 'removed' ? 'A loja não aprovou o seu pedido. Você pode pedir de novo em alguns dias.' : 'Só clientes aprovados pela loja veem o que ela oferece. Peça para ser cliente e aguarde a resposta.'}
                        </p>
                        <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} rows={2} placeholder="Recado para a loja (opcional): quem é você, como conheceu…" className="mt-4 w-full px-3 py-2.5 rounded-2xl text-[13px] outline-none resize-none" style={{ background: `${colors.border}30`, color: colors.textPrimary }} />
                        <button onClick={send} disabled={busy} className="mt-3 w-full h-12 rounded-2xl text-[14px] font-black text-white disabled:opacity-60" style={{ background: 'linear-gradient(135deg,#f97316,#dc2626)' }}>
                            {busy ? 'Enviando…' : userId ? 'Pedir para ser cliente' : 'Entrar para pedir'}
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}
