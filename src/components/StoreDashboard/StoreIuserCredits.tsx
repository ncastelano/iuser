// src/components/StoreDashboard/StoreIuserCredits.tsx — painel da loja: o que o iUser deve à loja pelos CARTÕES DE CRÉDITO do iUser
// (migration 20261130000085). O cliente usou o cartão no pedido, pagou menos à loja, e o iUser paga a diferença à loja por Pix.
// Só aparece se a loja já recebeu algum pedido com cartão (some se a função não existir no banco).
'use client'

import { useEffect, useState } from 'react'
import { Gift } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'

const brl = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function StoreIuserCredits({ storeId }: { storeId: string }) {
    const { colors } = useTheme()
    const [d, setD] = useState<{ due: number; pending: number; paid: number } | null>(null)
    useEffect(() => {
        let alive = true
        supabase.rpc('get_store_iuser_credits', { p_store: storeId }).then(({ data, error }) => {
            if (!alive || error || !data) return
            const x = data as any
            setD({ due: Number(x.due) || 0, pending: Number(x.pending) || 0, paid: Number(x.paid) || 0 })
        })
        return () => { alive = false }
    }, [storeId])
    if (!d || d.due + d.pending + d.paid === 0) return null
    return (
        <div className="rounded-3xl p-3.5 mt-2 flex items-start gap-3" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#f9731622', color: '#f97316' }}><Gift size={17} /></span>
            <div className="min-w-0 flex-1">
                <p className="text-[14px] font-black leading-tight" style={{ color: colors.textPrimary }}>Cartões do iUser</p>
                <p className="text-[11.5px] leading-snug mt-0.5" style={{ color: colors.textSecondary }}>
                    Clientes usaram o cartão de desconto do iUser. O desconto é pago pelo iUser a você, por Pix.
                </p>
                <p className="text-[12.5px] mt-1.5" style={{ color: colors.textPrimary }}>
                    <b style={{ color: d.due > 0 ? '#16a34a' : colors.textPrimary }}>{brl(d.due)}</b> a receber do iUser
                    {d.pending > 0 && <> · {brl(d.pending)} em pedidos abertos</>}
                    {d.paid > 0 && <> · {brl(d.paid)} já recebidos</>}
                </p>
            </div>
        </div>
    )
}
