// src/hooks/useShellLive.ts
//
// "O que está vivo agora" para a ilha do topo da navbar da 3.0: uma corrida pedida em andamento, pedido pronto/em preparo ou mensagens não
// lidas. Devolve só o mais importante (nessa ordem) e para onde tocar leva; sem nada em andamento devolve null (a ilha mostra o cumprimento).
// Corrida: consulta própria a cada 30 s (só com a aba visível); pedidos e mensagens vêm dos contadores que a casca já tem.
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export type ShellLiveKind = 'ride' | 'order' | 'chat' | 'store'
// `color` = a cor do aviso na ilha (as dos pedidos: novos verde, em preparo amarelo, prontos roxo; finalizados azul)
export interface ShellLive { kind: ShellLiveKind; title: string; sub?: string; path: string; hot?: boolean; color: string }
/** Pedidos NOVOS da loja que a pessoa atende: `prefer` = a ilha está no modo dessa loja, então eles vêm antes das mensagens */
export interface StoreNewOrders { count: number; name: string; path: string; prefer: boolean }
export const ORDER_COLORS = { novo: '#22c55e', preparo: '#eab308', pronto: '#a855f7', finalizado: '#3b82f6' } as const

interface ActiveRide { status: string; enRoute: boolean; arrived: boolean; started: boolean; candidates: number }

export function useShellLive(userId: string | null | undefined, orders: { pending: number; preparing: number; ready: number }, unread: number, chatPath: string, storeNew?: StoreNewOrders | null): ShellLive | null {
    const [ride, setRide] = useState<ActiveRide | null>(null)

    useEffect(() => {
        if (!userId) { setRide(null); return }
        let cancelled = false
        const load = async () => {
            if (document.hidden) return
            const { data } = await supabase
                .from('ride_requests')
                .select('id, status, driver_en_route, driver_arrived_at, ride_started_at')
                .eq('requester_id', userId)
                .in('status', ['pending', 'accepted'])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()
            if (cancelled) return
            if (!data) { setRide(null); return }
            let candidates = 0
            if (data.status === 'pending') {
                const { count } = await supabase.from('ride_applications').select('id', { count: 'exact', head: true }).eq('ride_request_id', data.id).eq('status', 'pending')
                candidates = count || 0
            }
            if (cancelled) return
            setRide({ status: data.status, enRoute: !!data.driver_en_route, arrived: !!data.driver_arrived_at, started: !!data.ride_started_at, candidates })
        }
        load()
        const t = setInterval(load, 30_000)
        const onVis = () => { if (!document.hidden) load() }
        document.addEventListener('visibilitychange', onVis)
        return () => { cancelled = true; clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
    }, [userId])

    if (ride) {
        const title = ride.status === 'pending'
            ? (ride.candidates > 0 ? `${ride.candidates} ${ride.candidates === 1 ? 'motorista quer' : 'motoristas querem'} te levar` : 'Procurando motorista')
            : ride.started ? 'Em viagem' : ride.arrived ? 'O motorista chegou' : ride.enRoute ? 'Motorista a caminho' : 'Motorista escolhido'
        return { kind: 'ride', title, sub: ride.status === 'pending' && ride.candidates > 0 ? 'Toque para escolher' : 'Toque para acompanhar', path: '/pedir-motorista', hot: ride.candidates > 0 || ride.arrived, color: '#f97316' }
    }
    const storeLive: ShellLive | null = storeNew && storeNew.count > 0
        ? { kind: 'store', title: `${storeNew.count} ${storeNew.count === 1 ? 'pedido novo' : 'pedidos novos'}`, sub: `${storeNew.name} · Toque para atender`, path: storeNew.path, hot: true, color: ORDER_COLORS.novo }
        : null
    // No modo da loja os pedidos novos vêm ANTES das mensagens
    if (storeLive && storeNew?.prefer) return storeLive
    if (orders.ready > 0) return { kind: 'order', title: orders.ready === 1 ? 'Seu pedido está pronto' : `${orders.ready} pedidos prontos`, sub: 'Toque para ver', path: '/carrinho?aba=pedidos', hot: true, color: ORDER_COLORS.pronto }
    if (unread > 0) return { kind: 'chat', title: `${unread} ${unread === 1 ? 'mensagem nova' : 'mensagens novas'}`, sub: 'Toque para responder', path: chatPath, hot: true, color: '#22c55e' }
    if (storeLive) return storeLive
    const going = orders.pending + orders.preparing
    if (going > 0) return { kind: 'order', title: orders.preparing > 0 ? 'Pedido em preparo' : 'Pedido enviado', sub: 'Toque para acompanhar', path: '/carrinho?aba=pedidos', color: orders.preparing > 0 ? ORDER_COLORS.preparo : ORDER_COLORS.novo }
    return null
}
