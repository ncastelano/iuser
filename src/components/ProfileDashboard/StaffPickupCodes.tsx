// Código de retirada para a EQUIPE da loja (migration ...68: get_my_staff_pickup_codes). Quem atende o balcão nem sempre é a dona:
// o funcionário com conta no iUser (employees.user_id, ativo) vê aqui o código do entregador que chegou, confere os pedidos e informa.
// Só aparece quando há um código valendo; atualiza a cada 15 s.
'use client'

import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'

interface Code { store_id: string; store_name: string; driver_name: string | null; code: string; expires_at: string; rides: number; ready: number; locked: boolean }

export default function StaffPickupCodes() {
    const { colors } = useTheme()
    const [codes, setCodes] = useState<Code[]>([])

    useEffect(() => {
        let alive = true
        const load = async () => {
            if (document.hidden) return
            const { data, error } = await supabase.rpc('get_my_staff_pickup_codes')
            if (alive && !error) setCodes((data as Code[]) || [])
        }
        load()
        const t = setInterval(load, 15000)
        return () => { alive = false; clearInterval(t) }
    }, [])

    if (codes.length === 0) return null
    return (
        <div className="mb-6 rounded-2xl p-4 flex flex-col gap-3" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            <p className="text-sm font-black flex items-center gap-2" style={{ color: colors.textPrimary }}><KeyRound size={16} color="#22c55e" /> Entregador na loja</p>
            {codes.map((c) => (
                <div key={c.store_id + c.code} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: '#22c55e14', border: '1px solid #22c55e55' }}>
                    <div className="min-w-0">
                        <p className="text-[13px] font-black truncate" style={{ color: colors.textPrimary }}>{c.driver_name?.split(' ')[0] || 'Entregador'} · {c.store_name}</p>
                        <p className="text-[11px] font-bold" style={{ color: colors.textSecondary }}>
                            {c.ready} de {c.rides} pedido{c.rides > 1 ? 's' : ''} pronto{c.rides > 1 ? 's' : ''}{c.locked ? ' · código travado por erros' : ''} · confira e informe o código
                        </p>
                    </div>
                    <span className="text-2xl font-black tracking-[0.2em] flex-shrink-0" style={{ color: '#16a34a' }}>{c.code}</span>
                </div>
            ))}
        </div>
    )
}
