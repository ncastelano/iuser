// components/checkin/StoreHere.tsx — "ESTOU AQUI" na página da loja (23/11/2026): quantas pessoas disseram que estão aqui agora,
// as fotos delas e, para quem está, "Saí daqui". Some quando não há ninguém (nada de "0 pessoas"). Dados: get_store_here (público).
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Flame, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'

type Here = { count: number; me: boolean; people: { name: string | null; slug: string | null; avatar: string | null }[] }
const avatar = (a: string | null) => !a ? null : /^https?:/.test(a) ? a : supabase.storage.from('avatars').getPublicUrl(a).data.publicUrl

export default function StoreHere({ storeId, colors }: { storeId: string; colors: any }) {
    const [here, setHere] = useState<Here | null>(null)
    const load = useCallback(async () => {
        const { data } = await supabase.rpc('get_store_here', { p_store: storeId })
        if (data) setHere(data as Here)
    }, [storeId])
    useEffect(() => {
        void load()
        const t = setInterval(load, 60000)
        const on = () => void load()
        window.addEventListener('iuser-checkin', on)
        return () => { clearInterval(t); window.removeEventListener('iuser-checkin', on) }
    }, [load])
    if (!here || here.count === 0) return null
    const leave = async () => {
        await supabase.rpc('check_out_store')
        toast.success('Pronto, você saiu daqui.')
        void load()
    }
    return (
        <div className="mt-3 flex items-center gap-2.5 rounded-2xl px-3 py-2.5" style={{ background: 'linear-gradient(90deg,#f9731622,#ef444414)', border: '1px solid #f9731640' }}>
            <span className="w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg,#f97316,#ef4444)' }}><Flame size={16} /></span>
            <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-black leading-tight" style={{ color: colors.textPrimary }}>{here.count === 1 ? '1 pessoa aqui agora' : `${here.count} pessoas aqui agora`}</span>
                <span className="flex mt-1">
                    {here.people.slice(0, 7).map((p, i) => (
                        <a key={i} href={p.slug ? `/${p.slug}` : undefined} title={p.name || ''} className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center text-[10px] font-black text-white flex-shrink-0" style={{ marginLeft: i ? -6 : 0, boxShadow: `0 0 0 2px ${colors.surface}`, background: '#f97316' }}>
                            {avatar(p.avatar) ? <img src={avatar(p.avatar)!} alt="" className="w-full h-full object-cover" /> : (p.name || '?').charAt(0).toUpperCase()}
                        </a>
                    ))}
                </span>
            </span>
            {here.me && <button onClick={leave} className="h-8 px-3 rounded-full text-[11.5px] font-black flex items-center gap-1 flex-shrink-0" style={{ background: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}` }}><LogOut size={13} /> Saí daqui</button>}
        </div>
    )
}
