// src/components/StoreDashboard/StoreDeliveryBoard.tsx
//
// "Entregas": o painel da LOJA para as entregas feitas pelos motoristas iUser (2.0 e 3.0). Quem agrupa os pedidos é o motorista (a disponibilidade é dele); a loja
// ACOMPANHA e LIBERA a retirada: (1) quantos pedidos saem num período e se há motoristas disponíveis por perto, (2) cada motorista que está com pedidos dela — carga
// em itens e volume contra o que ele diz caber, e em que etapa está —, (3) o CÓDIGO DE RETIRADA do motorista que chegou: a loja confere o que está entregando e só
// então passa o código. O código e os números vêm das RPCs do dono (get_store_pickup_codes / get_store_delivery_board); nada aqui calcula regra.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bike, CheckCircle2, Clock3, KeyRound, Package, Store as StoreIcon, Truck, Users } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'
import { fetchPickupCodes, fetchStoreBoard, loadLabel, type PickupCode, type StoreBoard } from '@/modules/deliveries'

const GREEN = '#22c55e', ORANGE = '#f97316', PURPLE = '#a855f7', BLUE = '#3b82f6'
const PHASE: Record<string, { label: string; color: string }> = {
    accepted: { label: 'Aceitou o pedido', color: '#64748b' }, to_store: { label: 'A caminho da loja', color: ORANGE }, at_store: { label: 'Na loja', color: GREEN }, delivering: { label: 'Entregando', color: BLUE },
}
const PERIODS = [{ m: 30, l: '30 min' }, { m: 60, l: '1 h' }, { m: 120, l: '2 h' }, { m: 180, l: '3 h' }]

export default function StoreDeliveryBoard({ storeId, v3 = false }: { storeId: string; v3?: boolean }) {
    const { colors } = useTheme()
    const [board, setBoard] = useState<StoreBoard | null>(null)
    const [codes, setCodes] = useState<PickupCode[]>([])
    const [minutes, setMinutes] = useState(60)
    const [loaded, setLoaded] = useState(false)

    const load = useCallback(async () => {
        const [b, c] = await Promise.all([fetchStoreBoard(storeId, minutes), fetchPickupCodes(storeId)])
        setBoard(b); setCodes(c); setLoaded(true)
    }, [storeId, minutes])
    useEffect(() => { load(); const t = setInterval(load, 6000); return () => clearInterval(t) }, [load])

    // Só aparece para quem usa entregador iUser (ou já teve movimento): sem nada, a loja não vê um cartão vazio
    if (!loaded || !board) return null
    const active = board.drivers.length > 0 || board.waiting_for_driver > 0 || board.out_in_period > 0 || codes.length > 0
    if (!active && board.drivers_nearby === 0) return null

    const soft = `${colors.border}40`
    const maxOut = Math.max(1, ...board.hourly.map((h) => h.out))
    return (
        <section className={`rounded-3xl p-4 flex flex-col gap-3 ${v3 ? '' : 'mb-6'}`} style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <h2 className="text-base font-black flex items-center gap-1.5" style={{ color: colors.textPrimary }}><Truck size={16} style={{ color: ORANGE }} /> Entregas</h2>
                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>Os motoristas escolhem e agrupam os pedidos; você acompanha e libera a retirada.</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                    {PERIODS.map((p) => (
                        <button key={p.m} onClick={() => setMinutes(p.m)} className="h-7 px-2 rounded-full text-[10px] font-black transition active:scale-95" style={minutes === p.m ? { background: ORANGE, color: '#fff' } : { background: soft, color: colors.textSecondary }}>{p.l}</button>
                    ))}
                </div>
            </div>

            {/* Saindo no período + disponibilidade */}
            <div className="grid grid-cols-4 gap-1.5">
                {[
                    { n: board.out_in_period, label: 'saíram', icon: <Package size={12} />, color: ORANGE },
                    { n: board.delivered_in_period, label: 'entregues', icon: <CheckCircle2 size={12} />, color: BLUE },
                    { n: board.waiting_for_driver, label: 'sem motorista', icon: <Clock3 size={12} />, color: board.waiting_for_driver > 0 ? '#ef4444' : colors.textSecondary },
                    { n: board.drivers_nearby, label: 'perto de você', icon: <Users size={12} />, color: board.drivers_nearby > 0 ? GREEN : '#ef4444' },
                ].map((c) => (
                    <div key={c.label} className="rounded-2xl px-2 py-2 text-center" style={{ background: `${c.color}14`, border: `1px solid ${c.color}30` }}>
                        <p className="text-xl font-black leading-none" style={{ color: c.color }}>{c.n}</p>
                        <p className="text-[9px] font-black mt-1 flex items-center justify-center gap-0.5" style={{ color: c.color }}>{c.icon}{c.label}</p>
                    </div>
                ))}
            </div>
            {board.hourly.length > 0 && (
                <div>
                    <div className="flex items-end gap-1 h-10">
                        {board.hourly.map((h, i) => (
                            <div key={i} className="flex-1 rounded-t-md" title={`${h.out} saíram`} style={{ height: `${Math.max(6, Math.round((h.out / maxOut) * 100))}%`, background: h.out > 0 ? ORANGE : `${colors.border}80` }} />
                        ))}
                    </div>
                    <p className="text-[10px] mt-1" style={{ color: colors.textSecondary }}>Saídas a cada 30 min (últimas 3 horas){board.drivers_nearby === 0 && board.waiting_for_driver > 0 ? ' · atenção: ninguém por perto para pegar o que está esperando' : ''}</p>
                </div>
            )}

            {/* Código de retirada: o motorista chegou */}
            {codes.map((c) => (
                <div key={c.driver_id} className="rounded-2xl p-3.5" style={{ background: `${GREEN}12`, border: `1.5px solid ${GREEN}` }}>
                    <div className="flex items-center gap-2.5">
                        {c.driver_avatar ? <img src={getAvatarUrl(supabase, c.driver_avatar)} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" /> : <span className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: GREEN }}><Bike size={18} /></span>}
                        <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-black truncate" style={{ color: colors.textPrimary }}>{c.driver_name} chegou para retirar</p>
                            <p className="text-[11px] truncate" style={{ color: colors.textSecondary }}>{c.vehicle || 'Motorista iUser'}{c.plate ? ` · ${c.plate}` : ''} · {c.rides} {c.rides === 1 ? 'pedido' : 'pedidos'} ({loadLabel(c.items, c.units)})</p>
                        </div>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wide flex items-center gap-1" style={{ color: GREEN }}><KeyRound size={11} /> Código de retirada</p>
                            <p className="text-4xl font-black tracking-[0.35em] leading-tight" style={{ color: colors.textPrimary }}>{c.code}</p>
                        </div>
                        <p className="text-[11px] font-bold text-right max-w-[48%]" style={{ color: c.ready < c.rides ? '#b45309' : colors.textSecondary }}>
                            {c.locked ? 'Travado por tentativas erradas.' : c.ready < c.rides ? `${c.rides - c.ready} pedido(s) ainda em preparo: marque pronto antes de passar o código.` : 'Confira os pedidos com ele e, só então, informe o código.'}
                        </p>
                    </div>
                </div>
            ))}

            {/* Motoristas com pedidos desta loja */}
            {board.drivers.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                    <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>Com pedidos seus agora</p>
                    {board.drivers.map((d) => {
                        const ph = PHASE[d.phase] || PHASE.accepted
                        const byUnits = d.capacity_units ? Math.min(1, d.units / d.capacity_units) : null
                        const byCount = d.capacity ? Math.min(1, d.rides / d.capacity) : 0
                        return (
                            <div key={d.driver_id} className="rounded-2xl px-3 py-2.5 flex items-center gap-2.5" style={{ background: soft }}>
                                {d.avatar ? <img src={getAvatarUrl(supabase, d.avatar)} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" /> : <span className="w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: ph.color }}><Bike size={16} /></span>}
                                <div className="min-w-0 flex-1">
                                    <p className="text-[13px] font-black truncate" style={{ color: colors.textPrimary }}>{d.name} <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full ml-1" style={{ background: `${ph.color}22`, color: ph.color }}>{ph.label}</span></p>
                                    <p className="text-[11px] truncate" style={{ color: colors.textSecondary }}>{d.rides} {d.rides === 1 ? 'pedido' : 'pedidos'} · {loadLabel(d.items, d.units)}{d.capacity ? ` · cabe ${d.capacity} entrega(s)` : ''}{d.capacity_units ? ` / ${d.capacity_units} un.` : ''}</p>
                                    <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: `${colors.border}80` }}><div className="h-full rounded-full" style={{ width: `${Math.round((byUnits ?? byCount) * 100)}%`, background: (byUnits ?? byCount) >= 1 ? '#ef4444' : PURPLE }} /></div>
                                </div>
                                {d.ready < d.rides && d.phase !== 'delivering' && <span className="text-[10px] font-black flex-shrink-0" style={{ color: '#b45309' }}>{d.ready}/{d.rides} prontos</span>}
                            </div>
                        )
                    })}
                </div>
            ) : (
                <p className="text-[12px] flex items-center gap-1.5" style={{ color: colors.textSecondary }}><StoreIcon size={13} /> Nenhum motorista com pedidos seus agora.</p>
            )}
        </section>
    )
}
