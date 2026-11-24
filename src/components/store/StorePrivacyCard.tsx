// components/store/StorePrivacyCard.tsx — LOJA PRIVADA no Editar loja (23/11/2026): o interruptor e, ligado, os pedidos para ser cliente
// (Aceitar / Recusar) e os clientes aprovados (Remover). Tudo pelo banco (list_store_clients / decide_store_client).
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Lock, Check, X, UserMinus, Copy } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'

type Client = { profile_id: string; name: string | null; slug: string | null; avatar_url: string | null; status: 'pending' | 'approved'; note: string | null; created_at: string }
const avatar = (a: string | null) => !a ? null : /^https?:/.test(a) ? a : supabase.storage.from('avatars').getPublicUrl(a).data.publicUrl

export default function StorePrivacyCard({ storeId, storeSlug, colors }: { storeId: string; storeSlug: string; colors: any }) {
    const [on, setOn] = useState<boolean | null>(null)
    const [busy, setBusy] = useState(false)
    const [clients, setClients] = useState<Client[] | null>(null)
    const load = useCallback(async () => {
        const { data } = await supabase.from('stores').select('is_private').eq('id', storeId).maybeSingle()
        setOn(!!(data as any)?.is_private)
        const r = await supabase.rpc('list_store_clients', { p_store: storeId })
        setClients(r.error ? [] : ((r.data || []) as Client[]))
    }, [storeId])
    useEffect(() => { void load() }, [load])

    const toggle = async () => {
        if (busy || on === null) return
        const next = !on
        if (next && !window.confirm('Deixar a loja privada? Ela some das listas e da busca; só quem você aprovar vê o que ela oferece (quem já comprou ou agendou é aprovado sozinho). O link continua funcionando para pedirem para ser cliente.')) return
        setBusy(true)
        const { error } = await supabase.from('stores').update({ is_private: next }).eq('id', storeId)
        setBusy(false)
        if (error) { toast.error('Não deu para mudar agora', { description: error.message }); return }
        toast.success(next ? 'Loja privada' : 'Loja pública de novo')
        void load()
    }
    const decide = async (c: Client, status: 'approved' | 'rejected' | 'removed') => {
        const { error } = await supabase.rpc('decide_store_client', { p_store: storeId, p_profile: c.profile_id, p_status: status })
        if (error) { toast.error(error.message); return }
        toast.success(status === 'approved' ? 'Cliente aprovado' : status === 'rejected' ? 'Pedido recusado' : 'Cliente removido')
        void load()
    }
    const link = `https://www.iuser.com.br/${storeSlug}`
    const pending = (clients || []).filter((c) => c.status === 'pending')
    const approved = (clients || []).filter((c) => c.status === 'approved')
    const row = (c: Client, actions: React.ReactNode) => (
        <div key={c.profile_id} className="flex items-center gap-2.5 py-2" style={{ borderTop: `1px solid ${colors.border}` }}>
            <span className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-white text-[13px] font-black flex-shrink-0" style={{ background: '#f97316' }}>
                {avatar(c.avatar_url) ? <img src={avatar(c.avatar_url)!} alt="" className="w-full h-full object-cover" /> : (c.name || '?').charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-black truncate" style={{ color: colors.textPrimary }}>{c.name || `@${c.slug}`}</span>
                <span className="block text-[11px] truncate" style={{ color: colors.textSecondary }}>{c.note ? `“${c.note}”` : `@${c.slug}`}</span>
            </span>
            {actions}
        </div>
    )

    return (
        <div className="rounded-3xl p-3.5" style={{ background: colors.surface, border: `1px solid ${on ? '#f9731666' : colors.border}` }}>
            <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: on ? '#f973161f' : `${colors.border}70`, color: on ? '#f97316' : colors.textSecondary }}><Lock size={19} /></span>
                <span className="flex-1 min-w-0">
                    <span className="block text-[13.5px] font-black" style={{ color: colors.textPrimary }}>Loja privada</span>
                    <span className="block text-[11.5px]" style={{ color: colors.textSecondary }}>Só clientes que você aprovar veem a loja. Ela some das listas; entra só quem tiver o link.</span>
                </span>
                <button role="switch" aria-checked={!!on} aria-label="Loja privada" onClick={toggle} disabled={busy || on === null} className="relative w-12 h-7 rounded-full flex-shrink-0 transition disabled:opacity-60" style={{ background: on ? '#f97316' : 'rgba(120,120,120,0.35)' }}>
                    <span className="absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all" style={{ left: on ? 24 : 4 }} />
                </button>
            </div>
            {on && (
                <>
                    <button onClick={() => { void navigator.clipboard?.writeText(link).then(() => toast.success('Link copiado')) }} className="mt-3 w-full h-9 rounded-full text-[12px] font-black flex items-center justify-center gap-1.5" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>
                        <Copy size={13} /> Copiar o link da loja para enviar a quem você quiser
                    </button>
                    <p className="mt-3 text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>Pedidos para ser cliente ({pending.length})</p>
                    {pending.length === 0 ? <p className="text-[12px] py-1" style={{ color: colors.textSecondary }}>Nenhum pedido agora.</p> : pending.map((c) => row(c, (
                        <span className="flex gap-1.5 flex-shrink-0">
                            <button onClick={() => decide(c, 'rejected')} aria-label="Recusar" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#ef44441a', color: '#ef4444' }}><X size={16} /></button>
                            <button onClick={() => decide(c, 'approved')} className="h-9 px-3 rounded-full text-[12px] font-black text-white flex items-center gap-1" style={{ background: '#16a34a' }}><Check size={14} /> Aceitar</button>
                        </span>
                    )))}
                    <p className="mt-3 text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>Clientes aprovados ({approved.length})</p>
                    {approved.length === 0 ? <p className="text-[12px] py-1" style={{ color: colors.textSecondary }}>Ainda ninguém.</p> : approved.slice(0, 50).map((c) => row(c, (
                        <button onClick={() => { if (window.confirm(`Remover ${c.name || 'este cliente'}? Ele deixa de ver a loja.`)) void decide(c, 'removed') }} aria-label="Remover" className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${colors.border}40`, color: colors.textSecondary }}><UserMinus size={15} /></button>
                    )))}
                </>
            )}
        </div>
    )
}
