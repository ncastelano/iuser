// src/components/StoreDashboard/StoreDeliveryBoard.tsx
//
// "Entregas" — o painel da LOJA para os pedidos entregues pelos entregadores do iUser (2.0 e 3.0). O foco é o PEDIDO, não o motorista: o dono precisa entregar pedidos, então a
// tela conta o que vai sair, em que etapa cada pedido está e quem vem buscar (e quando chega):
//   1. Para preparar — pedidos novos e em preparo (com o entregador que já aceitou e em quantos minutos chega);
//   2. Prontos, esperando o entregador — com o CÓDIGO DE RETIRADA quando ele chega (a loja confere o que entrega e só então passa o código);
//   3. A caminho do cliente — já saíram;
//   4. Entregues — os das últimas 3 horas.
// Tudo é leitura do que a loja já pode ver (pedidos, entrega, corrida e a posição ao vivo do entregador da corrida aceita); o código vem da RPC do dono (get_store_pickup_codes).
// Nada aqui decide regra: o tempo de chegada usa o mesmo cálculo do resto do app (modules/deliveries: haversineKm × etaMinutes).
'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, ChefHat, KeyRound, Package, Send, Store as StoreIcon, Truck } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'
import { fetchPickupCodes, etaMinutes, haversineKm, type PickupCode } from '@/modules/deliveries'

const GREEN = '#22c55e', YELLOW = '#eab308', PURPLE = '#a855f7', BLUE = '#3b82f6', ORANGE = '#f97316', RED = '#ef4444'
const RECENT_MIN = 180   // "entregues": as últimas 3 horas

type Phase = 'searching' | 'assigned' | 'to_store' | 'at_store' | 'on_the_way' | 'at_door' | 'delivered'
interface Row {
    id: string
    who: string
    status: 'pending' | 'preparing' | 'ready' | 'paid'
    itemsCount: number
    total: number
    createdAt: string
    updatedAt: string
    driverId: string | null
    driver: string | null
    avatar: string | null
    phase: Phase
    etaMin: number | null
    leftAt: string | null
}

const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '')
const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`
const ago = (iso: string) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : `há ${Math.floor(m / 60)} h` }

/** Uma frase só sobre o entregador daquele pedido */
function driverLine(r: Row): { text: string; color: string; strong?: boolean } {
    const quem = r.driver ? r.driver.trim().split(' ')[0] : 'O entregador'
    switch (r.phase) {
        case 'searching': return { text: 'Procurando entregador', color: RED, strong: true }
        case 'assigned':
        case 'to_store': return r.etaMin != null
            ? { text: r.etaMin <= 1 ? `${quem} está chegando na loja` : `${quem} chega em ~${r.etaMin} min`, color: ORANGE }
            : { text: `${quem} vai buscar o pedido`, color: ORANGE }
        case 'at_store': return r.status === 'ready'
            ? { text: `${quem} está na loja — passe o código para ele retirar`, color: GREEN, strong: true }
            : { text: `${quem} está na loja esperando — marque como pronto assim que puder`, color: '#b45309', strong: true }
        case 'on_the_way': return { text: `${quem} saiu às ${hhmm(r.leftAt)} para entregar`, color: BLUE }
        case 'at_door': return { text: `${quem} está na porta do cliente`, color: BLUE, strong: true }
        case 'delivered': return { text: `Entregue às ${hhmm(r.updatedAt)} por ${quem}`, color: BLUE }
    }
}

const STATUS = {
    pending: { label: 'Novo', color: GREEN },
    preparing: { label: 'Preparando', color: YELLOW },
    ready: { label: 'Pronto', color: PURPLE },
    paid: { label: 'Entregue', color: BLUE },
} as const

export default function StoreDeliveryBoard({ storeId, v3 = false }: { storeId: string; v3?: boolean }) {
    const { colors } = useTheme()
    const [rows, setRows] = useState<Row[]>([])
    const [codes, setCodes] = useState<PickupCode[]>([])
    const [loaded, setLoaded] = useState(false)

    const load = useCallback(async () => {
        const since = new Date(Date.now() - RECENT_MIN * 60_000).toISOString()
        const sel = 'id, status, created_at, updated_at, total_amount, buyer_profile_slug, buyer_name, order_items(quantity)'
        const [open, done, cds] = await Promise.all([
            supabase.from('orders').select(sel).eq('store_id', storeId).eq('delivery_option', 'entrega').in('status', ['pending', 'preparing', 'ready']).order('created_at', { ascending: true }).limit(60),
            supabase.from('orders').select(sel).eq('store_id', storeId).eq('delivery_option', 'entrega').eq('status', 'paid').gte('updated_at', since).order('updated_at', { ascending: false }).limit(12),
            fetchPickupCodes(storeId),
        ])
        const orders = [...((open.data as any[]) || []), ...((done.data as any[]) || [])]
        const ids = orders.map((o) => o.id as string)
        // entrega (ligação pedido → corrida) e corrida (quem aceitou, em que passo está)
        const { data: disp } = ids.length ? await supabase.from('order_delivery_dispatches').select('order_id, ride_request_id, status').in('order_id', ids).in('status', ['searching', 'accepted', 'completed']) : { data: [] as any[] }
        const rideIds = ((disp as any[]) || []).map((d) => d.ride_request_id as string).filter(Boolean)
        const { data: rides } = rideIds.length
            ? await supabase.from('ride_requests').select('id, driver_id, status, origin_lat, origin_lng, driver_en_route, driver_arrived_at, ride_started_at, arrived_destination_at').in('id', rideIds)
            : { data: [] as any[] }
        const driverIds = Array.from(new Set(((rides as any[]) || []).map((r) => r.driver_id as string).filter(Boolean)))
        const [{ data: profs }, { data: live }] = driverIds.length
            ? await Promise.all([
                supabase.from('profiles').select('id, name, avatar_url').in('id', driverIds),
                supabase.from('driver_pricing').select('driver_id, live_lat, live_lng, live_updated_at').in('driver_id', driverIds),
            ])
            : [{ data: [] as any[] }, { data: [] as any[] }]
        const rideOf = new Map(((rides as any[]) || []).map((r) => [r.id as string, r]))
        const dispOf = new Map(((disp as any[]) || []).map((d) => [d.order_id as string, d]))
        const profOf = new Map(((profs as any[]) || []).map((p) => [p.id as string, p]))
        const liveOf = new Map(((live as any[]) || []).map((l) => [l.driver_id as string, l]))

        const out: Row[] = orders.map((o) => {
            const d = dispOf.get(o.id)
            const r = d?.ride_request_id ? rideOf.get(d.ride_request_id) : null
            const driverId = (r?.driver_id as string) || null
            let phase: Phase = 'searching'
            if (r && driverId) {
                phase = r.status === 'completed' ? 'delivered'
                    : r.arrived_destination_at ? 'at_door'
                    : r.ride_started_at ? 'on_the_way'
                    : r.driver_arrived_at ? 'at_store'
                    : r.driver_en_route ? 'to_store' : 'assigned'
            }
            let etaMin: number | null = null
            const l = driverId ? liveOf.get(driverId) : null
            if ((phase === 'assigned' || phase === 'to_store') && l?.live_lat != null && l?.live_lng != null && r?.origin_lat != null && r?.origin_lng != null && l.live_updated_at && Date.now() - new Date(l.live_updated_at as string).getTime() < 3 * 60_000) {
                etaMin = etaMinutes(haversineKm({ lat: Number(l.live_lat), lng: Number(l.live_lng) }, { lat: Number(r.origin_lat), lng: Number(r.origin_lng) }))
            }
            const p = driverId ? profOf.get(driverId) : null
            return {
                id: o.id, who: o.buyer_profile_slug ? `@${o.buyer_profile_slug}` : (o.buyer_name || 'Cliente'),
                status: o.status, itemsCount: ((o.order_items as any[]) || []).reduce((n, i) => n + Number(i.quantity || 0), 0), total: Number(o.total_amount || 0),
                createdAt: o.created_at, updatedAt: o.updated_at, driverId, driver: (p?.name as string) || null, avatar: (p?.avatar_url as string) || null, phase, etaMin,
                leftAt: r?.ride_started_at || null,
            }
        })
        setRows(out); setCodes(cds); setLoaded(true)
    }, [storeId])
    useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t) }, [load])

    // Só aparece quando há movimento de entrega: sem nada, a loja não vê um cartão vazio
    if (!loaded || (rows.length === 0 && codes.length === 0)) return null

    const toPrepare = rows.filter((r) => r.status === 'pending' || r.status === 'preparing')
    const ready = rows.filter((r) => r.status === 'ready' && r.phase !== 'on_the_way' && r.phase !== 'at_door' && r.phase !== 'delivered')
    const onTheWay = rows.filter((r) => r.phase === 'on_the_way' || r.phase === 'at_door')
    const delivered = rows.filter((r) => r.status === 'paid')
    const sections: { key: string; title: string; hint?: string; color: string; Icon: any; list: Row[] }[] = [
        { key: 'prep', title: 'Para preparar', hint: 'Aceite e prepare: o entregador já está a caminho.', color: GREEN, Icon: ChefHat, list: toPrepare },
        { key: 'ready', title: 'Prontos, esperando o entregador', color: PURPLE, Icon: Package, list: ready },
        { key: 'way', title: 'A caminho do cliente', color: BLUE, Icon: Send, list: onTheWay },
        { key: 'done', title: 'Entregues (últimas 3 horas)', color: BLUE, Icon: CheckCircle2, list: delivered },
    ]
    const soft = `${colors.border}40`

    return (
        <section className={`rounded-3xl p-4 flex flex-col gap-3.5 ${v3 ? '' : 'mb-6'}`} style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            <div className="min-w-0">
                <h2 className="text-base font-black flex items-center gap-1.5" style={{ color: colors.textPrimary }}><Truck size={16} style={{ color: ORANGE }} /> Entregas dos pedidos</h2>
                <p className="text-[11px]" style={{ color: colors.textSecondary }}>Cada pedido de entrega, em que etapa está e quem vem buscar.</p>
            </div>

            {/* resumo em pedidos */}
            <div className="grid grid-cols-4 gap-1.5">
                {[
                    { n: toPrepare.length, label: 'para preparar', color: GREEN },
                    { n: ready.length, label: 'prontos', color: PURPLE },
                    { n: onTheWay.length, label: 'a caminho', color: BLUE },
                    { n: delivered.length, label: 'entregues', color: BLUE },
                ].map((c) => (
                    <div key={c.label} className="rounded-2xl px-1.5 py-2 text-center" style={{ background: `${c.color}14`, border: `1px solid ${c.color}30` }}>
                        <p className="text-xl font-black leading-none" style={{ color: c.color }}>{c.n}</p>
                        <p className="text-[9px] font-black mt-1 leading-tight" style={{ color: c.color }}>{c.label}</p>
                    </div>
                ))}
            </div>

            {/* código de retirada: o entregador chegou */}
            {codes.map((c) => (
                <div key={c.driver_id} className="rounded-2xl p-3.5" style={{ background: `${GREEN}12`, border: `1.5px solid ${GREEN}` }}>
                    <div className="flex items-center gap-2.5">
                        {c.driver_avatar ? <img src={getAvatarUrl(supabase, c.driver_avatar)} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" /> : <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${GREEN}30` }}><Truck size={18} style={{ color: GREEN }} /></span>}
                        <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-black truncate" style={{ color: colors.textPrimary }}>{c.driver_name} chegou para retirar {c.rides} {c.rides === 1 ? 'pedido' : 'pedidos'}</p>
                            <p className="text-[11px] truncate" style={{ color: colors.textSecondary }}>{c.vehicle || 'Entregador iUser'}{c.plate ? ` · ${c.plate}` : ''}</p>
                        </div>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wide flex items-center gap-1" style={{ color: GREEN }}><KeyRound size={11} /> Código de retirada</p>
                            <p className="text-4xl font-black tracking-[0.35em] leading-tight" style={{ color: colors.textPrimary }}>{c.code}</p>
                        </div>
                        <p className="text-[11px] font-bold text-right max-w-[48%]" style={{ color: c.ready < c.rides ? '#b45309' : colors.textSecondary }}>
                            {c.locked ? 'Travado por tentativas erradas.' : c.ready < c.rides ? `${c.rides - c.ready} pedido(s) ainda em preparo: marque pronto antes de passar o código.` : 'Confira os pedidos com ele e, só então, passe o código.'}
                        </p>
                    </div>
                </div>
            ))}

            {/* os pedidos, por etapa */}
            {sections.filter((s) => s.list.length > 0).map((s) => (
                <div key={s.key} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5 px-0.5">
                        <s.Icon size={13} style={{ color: s.color }} />
                        <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textPrimary }}>{s.title}</p>
                        <span className="text-[10px] font-black px-1.5 rounded-full" style={{ background: `${s.color}22`, color: s.color }}>{s.list.length}</span>
                    </div>
                    {s.hint && s.key !== 'done' && <p className="text-[10.5px] px-0.5 -mt-1" style={{ color: colors.textSecondary }}>{s.hint}</p>}
                    {s.list.map((r) => {
                        const st = STATUS[r.status]
                        const dl = driverLine(r)
                        return (
                            <div key={r.id} className="rounded-2xl px-3 py-2.5 flex flex-col gap-1" style={{ background: soft, borderLeft: `3px solid ${st.color}` }}>
                                <div className="flex items-center gap-2">
                                    <p className="text-[13px] font-black truncate flex-1" style={{ color: colors.textPrimary }}>{r.who}</p>
                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: `${st.color}22`, color: st.color }}>{st.label}</span>
                                </div>
                                <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                                    {r.itemsCount} {r.itemsCount === 1 ? 'item' : 'itens'} · {brl(r.total)} · pedido às {hhmm(r.createdAt)} ({ago(r.createdAt)})
                                </p>
                                <p className="text-[12px] flex items-center gap-1.5" style={{ color: dl.color, fontWeight: dl.strong ? 900 : 700 }}>
                                    {r.avatar ? <img src={getAvatarUrl(supabase, r.avatar)} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" /> : <Truck size={12} className="flex-shrink-0" />}
                                    <span className="min-w-0">{dl.text}</span>
                                </p>
                            </div>
                        )
                    })}
                </div>
            ))}
            {toPrepare.length + ready.length + onTheWay.length === 0 && delivered.length > 0 && (
                <p className="text-[12px] flex items-center gap-1.5" style={{ color: colors.textSecondary }}><StoreIcon size={13} /> Nenhum pedido de entrega em andamento agora.</p>
            )}
        </section>
    )
}
