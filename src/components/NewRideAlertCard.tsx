// components/NewRideAlertCard.tsx
//
// Conteúdo do toast "Nova corrida disponível!" (DriverRideAlertListener):
// endereço + os valores já na notificação — Tarifa iUser, Minha tarifa e um
// lápis pra digitar outro valor — pro motorista se candidatar sem abrir a
// página. "Ver no mapa" abre o percurso em /aceitar-corridas/mapa?ride=<id>.
'use client'

import { useState } from 'react'
import { Pencil, X, Map as MapIcon, Car } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import { submitRideApplication } from '@/lib/rideApplication'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface NewRideAlertCardProps {
    rideId: string
    originAddress?: string
    destinationAddress?: string
    platformPrice: number
    customPrice: number | null
    offeredPrice: number | null
    onClose: () => void
    onOpenMap: () => void
    onOpenList: () => void
}

export function NewRideAlertCard({
    rideId,
    originAddress,
    destinationAddress,
    platformPrice,
    customPrice,
    offeredPrice,
    onClose,
    onOpenMap,
    onOpenList,
}: NewRideAlertCardProps) {
    const { colors } = useTheme()
    const router = useRouter()
    const [editing, setEditing] = useState(false)
    const [value, setValue] = useState('')
    const [sending, setSending] = useState(false)

    const short = (a?: string) => (a || '').split(',')[0]

    const apply = async (price: number) => {
        if (!(price > 0)) {
            toast.error('Informe um valor válido')
            return
        }
        setSending(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Entre na sua conta para se candidatar')
            const { count: vehicleCount } = await supabase.from('driver_vehicles').select('vehicle_kind', { count: 'exact', head: true }).eq('driver_id', user.id)
            if (!vehicleCount) {
                toast.error('Cadastre seu veículo pra se candidatar.', {
                    action: { label: 'Cadastrar', onClick: () => router.push('/painel-motorista?aba=veiculo&veiculo=carro') },
                })
                setSending(false)
                return
            }
            await submitRideApplication(user.id, rideId, price)
            toast.success(`Candidatura enviada por R$ ${price.toFixed(2)}!`)
            onClose()
        } catch (err: any) {
            if (err?.code === '42501' || err?.code === 'PGRST301') {
                toast.error('Essa corrida já atingiu o limite de candidatos.')
            } else if (err?.code === '23505') {
                toast.error('Você já se candidatou a essa corrida.')
            } else {
                toast.error('Erro ao se candidatar: ' + (err?.message || 'tente novamente'))
            }
            setSending(false)
        }
    }

    const card = { background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }

    return (
        <div className="w-[min(92vw,380px)] rounded-2xl p-3.5 shadow-2xl" style={{ ...card, boxShadow: colors.shadow }}>
            <div className="flex items-start gap-2.5">
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#fff' }}>
                    <Car size={18} />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-black">Nova corrida disponível!</p>
                    {originAddress && (
                        <p className="text-xs truncate" style={{ color: colors.textSecondary }}>
                            {short(originAddress)} → {short(destinationAddress)}
                        </p>
                    )}
                </div>
                <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${colors.border}30`, color: colors.textSecondary }} title="Fechar">
                    <X size={14} />
                </button>
            </div>

            {offeredPrice != null ? (
                <button
                    onClick={() => apply(offeredPrice)}
                    disabled={sending}
                    className="w-full mt-3 py-2.5 rounded-full text-xs font-black uppercase tracking-wider disabled:opacity-70 flex items-center justify-center gap-2"
                    style={{ background: GRADIENT, color: '#fff' }}
                >
                    {sending ? <Spinner size={14} /> : `Aceitar frete por R$ ${offeredPrice.toFixed(2)}`}
                </button>
            ) : (
                <>
                    <div className="flex items-stretch gap-2 mt-3">
                        <button
                            onClick={() => apply(platformPrice)}
                            disabled={sending}
                            className="flex-1 rounded-xl px-2.5 py-2 text-left active:scale-95 transition-all disabled:opacity-70"
                            style={{ background: `${colors.border}25`, border: `1px solid ${colors.border}` }}
                        >
                            <p className="text-[9px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Tarifa iUser</p>
                            <p className="text-sm font-black">R$ {platformPrice.toFixed(2)}</p>
                        </button>
                        <button
                            onClick={() => customPrice != null && apply(customPrice)}
                            disabled={sending || customPrice == null}
                            className="flex-1 rounded-xl px-2.5 py-2 text-left active:scale-95 transition-all disabled:opacity-70"
                            style={customPrice != null ? { background: GRADIENT, color: '#fff' } : { background: `${colors.border}15`, border: `1px dashed ${colors.border}` }}
                        >
                            <p className="text-[9px] font-black uppercase tracking-wider" style={{ color: customPrice != null ? 'rgba(255,255,255,0.85)' : colors.textSecondary }}>Minha tarifa</p>
                            <p className="text-sm font-black" style={{ color: customPrice != null ? '#fff' : colors.textSecondary }}>
                                {customPrice != null ? `R$ ${customPrice.toFixed(2)}` : 'não definida'}
                            </p>
                        </button>
                        <button
                            onClick={() => {
                                if (editing) { setEditing(false); setValue('') }
                                else { setEditing(true); setValue((customPrice ?? platformPrice).toFixed(2)) }
                            }}
                            className="w-11 rounded-xl flex items-center justify-center flex-shrink-0 active:scale-95 transition-all"
                            style={editing ? { background: GRADIENT, color: '#fff' } : { background: `${colors.border}30`, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                            title="Digitar outro valor"
                        >
                            <Pencil size={15} />
                        </button>
                    </div>

                    {editing && (
                        <div className="flex items-center gap-2 mt-2">
                            <input
                                type="number"
                                inputMode="decimal"
                                autoFocus
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                placeholder="Valor (R$)"
                                className="flex-1 min-w-0 px-3 py-2 rounded-full border text-sm"
                                style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                            />
                            <button
                                onClick={() => apply(parseFloat(value) || 0)}
                                disabled={sending}
                                className="px-4 py-2 rounded-full text-xs font-black disabled:opacity-70"
                                style={{ background: GRADIENT, color: '#fff' }}
                            >
                                {sending ? <Spinner size={12} /> : 'Enviar'}
                            </button>
                        </div>
                    )}
                </>
            )}

            <div className="flex items-center gap-2 mt-2">
                <button
                    onClick={onOpenMap}
                    className="flex-1 py-2 rounded-full text-[11px] font-black uppercase tracking-wider active:scale-95 transition-all flex items-center justify-center gap-1.5"
                    style={{ background: `${colors.border}30`, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                >
                    <MapIcon size={13} /> Ver no mapa
                </button>
                <button
                    onClick={onOpenList}
                    className="flex-1 py-2 rounded-full text-[11px] font-black uppercase tracking-wider active:scale-95 transition-all"
                    style={{ background: 'transparent', color: colors.textSecondary }}
                >
                    Ver corridas
                </button>
            </div>
        </div>
    )
}
