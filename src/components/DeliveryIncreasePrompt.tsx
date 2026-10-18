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
import CustomerPayInstructions from '@/components/DeliveryPayment/CustomerPayInstructions'
import { reajustQuestion, searchStatusText, SEARCH_END_REASON_TEXT, definitiveSummary, remainingLabel } from '@/modules/delivery-search'

type Round = { id: string; status: string; final_freight: number; extra: number; round: number }
type Counter = { id: string; status: string; amount: number; driver_id: string }
type Reajust = { id: string; status: string; estimated_freight: number; current_offer: number; requested_limit: number; expires_at: string }
type Dispatch = {
    id: string
    status: string
    stage: string
    final_freight: number
    radius_km: number
    flow_version: number
    phase: string
    estimated_freight: number | null
    frozen_freight: number | null
    search_end_reason: string | null
    updated_at: string
    delivery_reajust_authorizations: Reajust[]
    reserved_until: string | null
    reservation_released_at: string | null
    order_delivery_rounds: Round[]
    order_delivery_counters: Counter[]
    orders: { total_amount: number; delivery_fee: number; stores: { name: string } | null } | null
}

const brl = (v: number) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`

export default function DeliveryIncreasePrompt({ userId, className = '' }: { userId: string | null; className?: string }) {
    const { colors } = useTheme()
    const [items, setItems] = useState<Dispatch[]>([])
    const [busy, setBusy] = useState<string | null>(null)
    const [drivers, setDrivers] = useState<Record<string, string>>({})
    const [, setTick] = useState(0)
    useEffect(() => {
        const t = setInterval(() => setTick((n) => n + 1), 1000)      // contagem regressiva da reserva
        return () => clearInterval(t)
    }, [])

    const load = useCallback(async () => {
        if (!userId) return
        const { data } = await supabase
            .from('order_delivery_dispatches')
            .select('id, status, stage, final_freight, radius_km, flow_version, phase, estimated_freight, frozen_freight, search_end_reason, updated_at, reserved_until, reservation_released_at, order_delivery_rounds(id, status, final_freight, extra, round), order_delivery_counters(id, status, amount, driver_id), delivery_reajust_authorizations(id, status, estimated_freight, current_offer, requested_limit, expires_at), orders(total_amount, delivery_fee, stores(name))')
            .eq('customer_id', userId)
            // V1: em busca ou aceita. V2 também mostra "sem entregador" por 1 dia (status cancelado + fase SEM_ENTREGADOR)
            .or('status.in.(searching,accepted),and(status.eq.cancelled,phase.eq.SEM_ENTREGADOR)')
        const list = ((data as unknown as Dispatch[]) || []).filter((x) => x.status !== 'cancelled' || Date.now() - new Date(x.updated_at).getTime() < 24 * 3600_000)
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
            .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_reajust_authorizations' }, () => load())
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

    // V2: o cliente autoriza (ou não) um NOVO LIMITE de busca. Não é pagamento: o valor final é o que um entregador aceitar.
    const respondReajust = async (authId: string, accept: boolean) => {
        setBusy(authId)
        const { data, error } = await supabase.rpc('respond_delivery_reajust', { p_authorization: authId, p_accept: accept })
        setBusy(null)
        if (error) toast.error(error.message)
        else if ((data as { expired?: boolean } | null)?.expired) toast.error('O tempo para autorizar terminou.')
        else toast.success(accept ? 'Limite autorizado. Estamos ampliando a busca.' : 'Combinado, não vamos passar do valor anterior.')
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

    const STAGE_TEXT: Record<string, string> = {
        assigned: 'Um entregador aceitou a sua entrega',
        to_store: 'O entregador está indo buscar o pedido na loja',
        at_store: 'O entregador chegou na loja',
        in_transit: 'O entregador está a caminho com o seu pedido',
    }

    return (
        <div className={`flex flex-col gap-3 ${className}`}>
            {items.map((d) => {
                // ===== Entrega do novo fluxo (V2) =====
                if (d.flow_version === 2) {
                    const store = d.orders?.stores?.name
                    const pending = d.delivery_reajust_authorizations.find((a) => a.status === 'pending')
                    const asking = d.phase === 'AGUARDANDO_AUTORIZACAO_REAJUSTE' && !!pending
                    const done = d.phase === 'ENTREGADOR_RESERVADO' || d.phase === 'AGUARDANDO_PAGAMENTO_CLIENTE'
                    const reserved = done && d.frozen_freight != null && d.orders
                    const sum = reserved && d.orders
                        ? definitiveSummary({ itemsTotal: Number(d.orders.total_amount) - Number(d.orders.delivery_fee), deliveryFee: Number(d.orders.delivery_fee), totalAmount: Number(d.orders.total_amount), estimatedFreight: d.estimated_freight })
                        : null
                    const left = reserved && !d.reservation_released_at ? remainingLabel(d.reserved_until) : null
                    const q = pending ? reajustQuestion({ estimatedFreight: Number(pending.estimated_freight), currentOffer: Number(pending.current_offer), requestedLimit: Number(pending.requested_limit) }) : null
                    return (
                        <div key={d.id} className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: done ? '#16a34a12' : asking ? '#f9731612' : `${colors.border}20`, border: `1.5px solid ${done ? '#16a34a' : asking ? '#f97316' : colors.border}` }}>
                            <div>
                                <p className="text-sm font-black" style={{ color: done ? '#15803d' : colors.textPrimary }}>
                                    {asking && q ? q.title : searchStatusText(d.phase, Number(d.radius_km), d.frozen_freight)}
                                </p>
                                <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                                    {store ? `Pedido de ${store} · ` : ''}
                                    {d.estimated_freight != null ? `estimativa inicial ${brl(d.estimated_freight)}` : ''}
                                    {d.status === 'searching' ? ` · oferta atual ${brl(d.final_freight)}` : ''}
                                    {d.status === 'cancelled' && d.search_end_reason ? ` · ${SEARCH_END_REASON_TEXT[d.search_end_reason] || ''}` : ''}
                                </p>
                            </div>
                            {sum && (
                                <div className="rounded-xl p-3 flex flex-col gap-1 text-sm" style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}>
                                    <div className="flex justify-between"><span style={{ color: colors.textSecondary }}>Produtos</span><span>{sum.products}</span></div>
                                    <div className="flex justify-between"><span style={{ color: colors.textSecondary }}>Entrega</span><span>{sum.delivery}</span></div>
                                    <div className="flex justify-between font-black border-t pt-1" style={{ borderColor: colors.border }}><span>Total</span><span>{sum.total}</span></div>
                                    {sum.initialEstimate && <p className="text-[11px]" style={{ color: colors.textSecondary }}>{sum.initialEstimate}</p>}
                                    {left && <p className="text-[11px]" style={{ color: colors.textSecondary }}>Reserva do entregador: {left}</p>}
                                </div>
                            )}
                            {d.status === 'accepted' && <CustomerPayInstructions dispatchId={d.id} />}
                            {asking && q && pending && (
                                <>
                                    <p className="text-sm" style={{ color: colors.textPrimary }}>{q.body}</p>
                                    <p className="text-xs" style={{ color: colors.textSecondary }}>{q.note}</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => respondReajust(pending.id, true)}
                                            disabled={busy === pending.id}
                                            className="h-11 rounded-full text-sm font-black text-white disabled:opacity-60"
                                            style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)' }}
                                        >
                                            Autorizar
                                        </button>
                                        <button
                                            onClick={() => respondReajust(pending.id, false)}
                                            disabled={busy === pending.id}
                                            className="h-11 rounded-full text-sm font-black disabled:opacity-60"
                                            style={{ background: `${colors.border}50`, color: colors.textPrimary }}
                                        >
                                            Não autorizar
                                        </button>
                                    </div>
                                </>
                            )}
                            {(d.status === 'searching' || reserved) && (
                                <button onClick={() => cancel(d.id)} disabled={busy === d.id} className="self-start text-xs font-bold underline disabled:opacity-60" style={{ color: colors.textSecondary }}>
                                    Cancelar entrega
                                </button>
                            )}
                        </div>
                    )
                }
                if (d.status === 'accepted') {
                    const store = d.orders?.stores?.name
                    return (
                        <div key={d.id} className="rounded-2xl p-4" style={{ background: '#16a34a12', border: '1.5px solid #16a34a' }}>
                            <p className="text-sm font-black" style={{ color: '#15803d' }}>{STAGE_TEXT[d.stage] || 'Entrega em andamento'}</p>
                            <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                                {store ? `Pedido de ${store} · ` : ''}frete de {brl(d.final_freight)}
                            </p>
                        </div>
                    )
                }
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
