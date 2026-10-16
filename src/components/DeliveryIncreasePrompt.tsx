// components/DeliveryIncreasePrompt.tsx
//
// Entrega iUser vista pelo cliente: enquanto o pedido espera um entregador, mostra a busca e,
// quando o sistema propõe um frete maior pra ampliar a busca, pergunta ao cliente. O valor só
// muda se ele tocar em "Aceitar novo valor" — o cálculo e a gravação são do banco (RPC
// respond_delivery_increase); aqui nada decide preço.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'

type Round = { id: string; status: string; final_freight: number; extra: number; round: number }
type Counter = { id: string; status: string; amount: number; driver_id: string }
type Dispatch = {
    id: string
    final_freight: number
    radius_km: number
    order_delivery_rounds: Round[]
    order_delivery_counters: Counter[]
    orders: { stores: { name: string } | null } | null
}

const brl = (v: number) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`

export default function DeliveryIncreasePrompt({ userId, className = '' }: { userId: string | null; className?: string }) {
    const { colors } = useTheme()
    const [items, setItems] = useState<Dispatch[]>([])
    const [busy, setBusy] = useState<string | null>(null)
    const [drivers, setDrivers] = useState<Record<string, string>>({})

    const load = useCallback(async () => {
        if (!userId) return
        const { data } = await supabase
            .from('order_delivery_dispatches')
            .select('id, final_freight, radius_km, order_delivery_rounds(id, status, final_freight, extra, round), order_delivery_counters(id, status, amount, driver_id), orders(stores(name))')
            .eq('customer_id', userId)
            .eq('status', 'searching')
        const list = (data as unknown as Dispatch[]) || []
        setItems(list)
        const ids = Array.from(new Set(list.flatMap((d) => d.order_delivery_counters.filter((c) => c.status === 'pending_customer').map((c) => c.driver_id))))
        if (ids.length > 0) {
            const { data: profiles } = await supabase.from('profiles').select('id, name, profileSlug').in('id', ids)
            setDrivers(Object.fromEntries((profiles || []).map((p) => [p.id, p.profileSlug ? `@${p.profileSlug}` : p.name || 'Um motorista'])))
        }
    }, [userId])

    useEffect(() => {
        load()
        if (!userId) return
        const channel = supabase
            .channel(`delivery-prompt-${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'order_delivery_dispatches', filter: `customer_id=eq.${userId}` }, () => load())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'order_delivery_rounds' }, () => load())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'order_delivery_counters' }, () => load())
            .subscribe()
        const poll = setInterval(load, 30_000)
        return () => {
            clearInterval(poll)
            supabase.removeChannel(channel)
        }
    }, [userId, load])

    const respond = async (roundId: string, accept: boolean) => {
        setBusy(roundId)
        const { error } = await supabase.rpc('respond_delivery_increase', { p_round: roundId, p_accept: accept })
        setBusy(null)
        if (error) toast.error(error.message)
        else toast.success(accept ? 'Novo valor autorizado. Estamos ampliando a busca.' : 'Combinado, seguimos buscando pelo valor anterior.')
        load()
    }

    const respondCounter = async (counterId: string, accept: boolean) => {
        setBusy(counterId)
        const { error } = await supabase.rpc('respond_delivery_counter', { p_counter: counterId, p_accept: accept })
        setBusy(null)
        if (error) toast.error(error.message)
        else toast.success(accept ? 'Proposta aceita! O entregador já está com a sua entrega.' : 'Proposta recusada.')
        load()
    }

    const cancel = async (dispatchId: string) => {
        if (!window.confirm('Cancelar a entrega? O pedido continua com a loja, mas sem motorista do iUser.')) return
        setBusy(dispatchId)
        const { error } = await supabase.rpc('cancel_order_delivery', { p_dispatch: dispatchId })
        setBusy(null)
        if (error) toast.error(error.message)
        else toast.success('Entrega cancelada')
        load()
    }

    if (items.length === 0) return null

    return (
        <div className={`flex flex-col gap-3 ${className}`}>
            {items.map((d) => {
                const proposal = d.order_delivery_rounds.find((r) => r.status === 'pending_customer')
                const counters = d.order_delivery_counters.filter((c) => c.status === 'pending_customer')
                const store = d.orders?.stores?.name
                return (
                    <div key={d.id} className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: proposal || counters.length ? '#f9731612' : `${colors.border}20`, border: `1.5px solid ${proposal || counters.length ? '#f97316' : colors.border}` }}>
                        <div>
                            <p className="text-sm font-black" style={{ color: colors.textPrimary }}>
                                {counters.length > 0 ? 'Um entregador quer fazer a sua entrega' : proposal ? 'Ainda não encontramos um entregador' : 'Procurando um entregador'}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                                {store ? `Pedido de ${store} · ` : ''}frete de {brl(d.final_freight)} · buscando em até {Number(d.radius_km)} km da loja
                            </p>
                        </div>
                        {counters.map((c) => (
                            <div key={c.id} className="rounded-xl p-3 flex flex-col gap-2" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                                <p className="text-sm" style={{ color: colors.textPrimary }}>
                                    <b>{drivers[c.driver_id] || 'Um motorista'}</b> quer fazer a entrega por <b style={{ color: '#f97316' }}>{brl(c.amount)}</b> (hoje {brl(d.final_freight)}). Só cobramos a mais se você aceitar.
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => respondCounter(c.id, true)}
                                        disabled={busy === c.id}
                                        className="h-10 rounded-full text-sm font-black text-white disabled:opacity-60"
                                        style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)' }}
                                    >
                                        Aceitar proposta
                                    </button>
                                    <button
                                        onClick={() => respondCounter(c.id, false)}
                                        disabled={busy === c.id}
                                        className="h-10 rounded-full text-sm font-black disabled:opacity-60"
                                        style={{ background: `${colors.border}50`, color: colors.textPrimary }}
                                    >
                                        Recusar
                                    </button>
                                </div>
                            </div>
                        ))}
                        {proposal && (
                            <>
                                <p className="text-sm" style={{ color: colors.textPrimary }}>
                                    Podemos aumentar a entrega de <b>{brl(d.final_freight)}</b> para <b style={{ color: '#f97316' }}>{brl(proposal.final_freight)}</b> para ampliar a busca? Só cobramos a mais se você aceitar.
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => respond(proposal.id, true)}
                                        disabled={busy === proposal.id}
                                        className="h-11 rounded-full text-sm font-black text-white disabled:opacity-60"
                                        style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)' }}
                                    >
                                        Aceitar novo valor
                                    </button>
                                    <button
                                        onClick={() => respond(proposal.id, false)}
                                        disabled={busy === proposal.id}
                                        className="h-11 rounded-full text-sm font-black disabled:opacity-60"
                                        style={{ background: `${colors.border}50`, color: colors.textPrimary }}
                                    >
                                        Não aceitar
                                    </button>
                                </div>
                            </>
                        )}
                        <button onClick={() => cancel(d.id)} disabled={busy === d.id} className="self-start text-xs font-bold underline disabled:opacity-60" style={{ color: colors.textSecondary }}>
                            Cancelar entrega
                        </button>
                    </div>
                )
            })}
        </div>
    )
}
