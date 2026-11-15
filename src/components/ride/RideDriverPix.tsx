// Passageiro que escolheu pagar por Pix: a chave do motorista ESCOLHIDO, para pagar direto a ele (o iUser não movimenta esse dinheiro).
// A chave só sai pelo banco (get_ride_driver_pix: só quem pediu, corrida com motorista, pagamento Pix, até 1 dia). Sem chave, diz para combinar na conversa.
'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, QrCode } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'
import { useTheme } from '@/app/contexts/theme'
import { PIX_TYPE_LABEL } from '@/modules/delivery-search'

interface DriverPix { registered: boolean; type?: string; key?: string }

export default function RideDriverPix({ rideId, driverName, amount }: { rideId: string; driverName: string | null; amount: number | null }) {
    const { colors } = useTheme()
    const [pix, setPix] = useState<DriverPix | null>(null)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        let alive = true
        supabase.rpc('get_ride_driver_pix', { p_ride: rideId }).then(({ data, error }) => { if (alive && !error) setPix((data as DriverPix) || null) })
        return () => { alive = false }
    }, [rideId])

    if (!pix) return null
    const first = driverName?.split(' ')[0] || 'o motorista'

    if (!pix.registered || !pix.key) {
        return (
            <div className="rounded-xl px-3 py-2.5 text-xs font-bold" style={{ background: '#f59e0b18', color: '#b45309', border: '1px solid #f59e0b55' }}>
                {first} ainda não cadastrou o Pix. Combine na conversa como pagar.
            </div>
        )
    }

    const copy = async () => {
        try { await navigator.clipboard.writeText(pix.key!); setCopied(true); toast.success('Chave Pix copiada'); setTimeout(() => setCopied(false), 2500) }
        catch { toast.error('Não deu para copiar. Segure na chave para copiar.') }
    }

    return (
        <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: '#16a34a12', border: '1px solid #16a34a55' }}>
            <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white" style={{ background: '#16a34a' }}><QrCode size={18} /></span>
            <div className="min-w-0 flex-1">
                <p className="text-[12px] font-black" style={{ color: colors.textPrimary }}>
                    Pague {amount != null ? `R$ ${amount.toFixed(2).replace('.', ',')} ` : ''}no Pix de {first}
                </p>
                <p className="text-[11px] font-bold truncate select-all" style={{ color: colors.textSecondary }}>
                    {PIX_TYPE_LABEL[pix.type || ''] || 'Chave'}: {pix.key}
                </p>
            </div>
            <button type="button" onClick={copy} className="h-9 px-3 rounded-full text-[12px] font-black text-white flex items-center gap-1 flex-shrink-0" style={{ background: '#16a34a' }}>
                {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copiada' : 'Copiar'}
            </button>
        </div>
    )
}
