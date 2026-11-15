// src/hooks/useShellLive.ts
//
// "O que está vivo agora" para a ilha do topo da navbar da 3.0: uma corrida pedida em andamento, pedido pronto/em preparo ou mensagens não
// lidas. Devolve só o mais importante (nessa ordem) e para onde tocar leva; sem nada em andamento devolve null (a ilha mostra o cumprimento).
// Corrida: consulta própria a cada 30 s (só com a aba visível); pedidos e mensagens vêm dos contadores que a casca já tem.
'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export type ShellLiveKind = 'ride' | 'order' | 'chat' | 'store'
// `color` = a cor do aviso na ilha (as dos pedidos: novos verde, em preparo amarelo, prontos roxo; finalizados azul)
export interface ShellLive { kind: ShellLiveKind; title: string; sub?: string; path: string; hot?: boolean; color: string; /** vários avisos lado a lado, cada um na sua cor (ex.: pedidos de produtos e de serviços) */ parts?: { key?: string; text: string; color: string; /** para onde esse aviso leva ao ser tocado (cada um tem o seu) */ path?: string }[] }
/** Pedidos NOVOS da loja que a pessoa atende (produtos e serviços a aceitar): `prefer` = a ilha está no modo dessa loja, então eles vêm antes das mensagens */
export interface StoreNewOrders { products: number; services: number; name: string; path: string; prefer: boolean }
export const ORDER_COLORS = { novo: '#22c55e', preparo: '#eab308', pronto: '#a855f7', finalizado: '#3b82f6' } as const
/** Pedidos de SERVIÇO (agendamentos a aceitar): cor própria, para a ilha diferenciar de pedidos de produtos */
export const SERVICE_COLOR = '#14b8a6'

interface ActiveRide { status: string; enRoute: boolean; arrived: boolean; started: boolean; candidates: number }

export function useShellLive(userId: string | null | undefined, orders: { pending: number; preparing: number; ready: number }, unread: number, chatPath: string, storeNew?: StoreNewOrders | null, cart?: { count: number; total: number } | null): ShellLive | null {
    const [ride, setRide] = useState<ActiveRide | null>(null)
    // Quando cada contagem (pedidos, serviços, mensagens) AUMENTOU pela última vez: o que atualizou por último fica em cima na ilha.
    // Nos primeiros segundos as contagens chegando do banco não contam como "atualização" (a ordem inicial é a de sempre).
    const mountedAt = useRef(Date.now())
    const stamps = useRef<Record<'p' | 's' | 'm', { n: number; t: number }>>({ p: { n: 0, t: 0 }, s: { n: 0, t: 0 }, m: { n: 0, t: 0 } })

    useEffect(() => {
        if (!userId) { setRide(null); return }
        let cancelled = false
        const load = async () => {
            if (document.hidden) return
            const { data } = await supabase
                .from('ride_requests')
                .select('id, status, driver_en_route, driver_arrived_at, ride_started_at')
                .eq('requester_id', userId)
                .is('order_id', null)   // a entrega de um pedido de loja é pedida pela LOJA (o dono é o solicitante), mas não é uma corrida da pessoa
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

    const sp = storeNew?.products || 0, ss = storeNew?.services || 0
    for (const [k, n] of [['p', sp], ['s', ss], ['m', unread]] as const) {
        const e = stamps.current[k]
        if (n > e.n && (e.n > 0 || Date.now() - mountedAt.current > 8000)) e.t = Date.now()
        e.n = n
    }
    const CHAT_COLOR = '#22c55e'
    // Pedidos de produtos, pedidos de serviço e mensagens: cada um na sua cor, lado a lado (com um tipo só, o texto é completo)
    const kinds = [
        { key: 'store-p', n: sp, t: stamps.current.p.t, one: 'pedido', many: 'pedidos', full1: 'pedido novo', fullN: 'pedidos novos', color: ORDER_COLORS.novo },
        { key: 'store-s', n: ss, t: stamps.current.s.t, one: 'serviço', many: 'serviços', full1: 'serviço para aceitar', fullN: 'serviços para aceitar', color: SERVICE_COLOR },
        { key: 'store-m', n: unread, t: stamps.current.m.t, one: 'mensagem', many: 'mensagens', full1: 'mensagem nova', fullN: 'mensagens novas', color: CHAT_COLOR },
    ].filter((k) => k.n > 0).sort((a, b) => b.t - a.t)   // o último que atualizou vem primeiro (empate: pedidos, serviços, mensagens)
    const storeLive: ShellLive | null = storeNew && sp + ss > 0
        ? {
            kind: 'store',
            title: kinds.map((k) => `${k.n} ${k.n === 1 ? k.one : k.many}`).join(' · '),
            sub: storeNew.name, path: storeNew.path, hot: true,
            color: kinds[0].color,
            parts: kinds.map((k) => kinds.length === 1
                ? { key: k.key, text: `${k.n} ${k.n === 1 ? k.full1 : k.fullN}`, color: k.color }
                : { key: k.key, text: `${k.n} ${k.n === 1 ? k.one : k.many}`, color: k.color }),
        }
        : null
    // No modo da loja os pedidos novos vêm ANTES das mensagens (e as mensagens entram junto, se houver)
    if (storeLive && storeNew?.prefer) return storeLive
    // Cliente (não está no modo da loja): UM aviso só com VÁRIAS partes, cada uma na sua cor e levando ao seu lugar — pedidos que fiz, corrida, mensagens e a sacola.
    // Tocar no cartão vai ao mais importante (os pedidos vêm antes da corrida); tocar numa parte leva à parte.
    const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`
    const ORDERS_PATH = '/carrinho?aba=pedidos'
    const parts: { key: string; text: string; color: string; path: string; hot?: boolean }[] = []
    if (orders.ready > 0) parts.push({ key: 'ready', text: orders.ready === 1 ? '1 pedido pronto' : `${orders.ready} pedidos prontos`, color: ORDER_COLORS.pronto, path: ORDERS_PATH, hot: true })
    if (orders.preparing > 0) parts.push({ key: 'preparing', text: orders.preparing === 1 ? '1 em preparo' : `${orders.preparing} em preparo`, color: ORDER_COLORS.preparo, path: ORDERS_PATH })
    if (orders.pending > 0) parts.push({ key: 'pending', text: orders.pending === 1 ? '1 enviado' : `${orders.pending} enviados`, color: ORDER_COLORS.novo, path: ORDERS_PATH })
    if (ride) {
        const title = ride.status === 'pending'
            ? (ride.candidates > 0 ? `${ride.candidates} ${ride.candidates === 1 ? 'motorista quer' : 'motoristas querem'} te levar` : 'Procurando motorista')
            : ride.started ? 'Em viagem' : ride.arrived ? 'Motorista chegou' : ride.enRoute ? 'Motorista a caminho' : 'Motorista escolhido'
        parts.push({ key: 'ride', text: title, color: '#f97316', path: '/pedir-motorista', hot: ride.candidates > 0 || ride.arrived })
    }
    if (unread > 0) parts.push({ key: 'chat', text: unread === 1 ? '1 mensagem' : `${unread} mensagens`, color: CHAT_COLOR, path: chatPath, hot: true })
    if (cart && cart.count > 0) parts.push({ key: 'cart', text: `Sacola ${cart.count} ${cart.count === 1 ? 'item' : 'itens'} · ${brl(cart.total)}`, color: '#f97316', path: '/carrinho' })
    if (parts.length === 0) return null
    const main = parts[0]
    const hasOrders = orders.ready + orders.preparing + orders.pending > 0
    return {
        kind: hasOrders ? 'order' : ride ? 'ride' : unread > 0 ? 'chat' : 'order',
        title: parts.map((x) => x.text).join(' · '),
        sub: hasOrders ? 'Seus pedidos' : ride ? 'Sua corrida' : unread > 0 ? 'Conversas' : 'Seu carrinho',
        path: main.path, hot: !!main.hot, color: main.color,
        parts: parts.map(({ key, text, color, path }) => ({ key, text, color, path })),
    }
}
