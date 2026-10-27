// src/versions/v3/screens/DriverDeliveriesScreen.tsx
//
// CENTRAL DE ENTREGAS (3.0): o painel do motorista iUser para as ENTREGAS DE LOJA (pizzaria, lanchonete...). Entrega aparece "do nada" para quem está online
// no raio; o motorista aceita as que quiser — qualquer uma — dentro do que CABE na mochila (a capacidade dele, conferida pelo banco) e pode pegar um COMBO
// (várias entregas perto uma da outra). Depois a tela GUIA a saída: ir à loja → chegar → conferir e pegar os pedidos → entregar um por um, na melhor ordem, com
// o endereço, o que levar (itens, troco, maquininha) e links para o Waze e o Google Maps. Em cima, o resumo do dia (ganho, entregas, mochila).
// Só apresentação: regras em `modules/deliveries` (puras e testadas), quem pode o quê é do banco.
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Bike, Check, ChevronDown, ChevronUp, Clock3, Flame, Layers, MapPin, Minus, Navigation, Package, Plus, Power, Store as StoreIcon, Zap } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { isLocalDevOnly } from '@/lib/devOnly'
import {
    acceptOffer, arriveAtStore, brl, capacityState, completeDelivery, earnings, etaMinutes, fetchActive, fetchDriverState, fetchDoneToday, fetchOffers, haversineKm, itemsList,
    leaveForStore, mapsUrl, paymentRecap, phaseOf, pickUpOrders, PHASE_LABEL, routeKm, routeOrder, setCapacity, setOnline, shortAddress, suggestBatches, wazeUrl, withinRadius,
    type ActiveDelivery, type DeliveryOffer, type DoneToday, type DriverState, type LatLng,
} from '@/modules/deliveries'

const ORANGE = '#f97316'
const GREEN = '#22c55e'

/** Mapa esquemático da saída (sem depender de mapa externo): a loja, as paradas numeradas na ordem, o trecho que já foi e o que falta, e onde o motorista está */
function RouteDiagram({ store, stops, current, me, colors }: { store: LatLng | null; stops: ActiveDelivery[]; current: string | null; me: LatLng | null; colors: any }) {
    const pts: { key: string; p: LatLng; kind: 'store' | 'stop' | 'me'; n?: number; id?: string }[] = []
    if (store) pts.push({ key: 'store', p: store, kind: 'store' })
    stops.forEach((s, i) => { if (s.to) pts.push({ key: s.id, p: s.to, kind: 'stop', n: i + 1, id: s.id }) })
    if (me) pts.push({ key: 'me', p: me, kind: 'me' })
    if (pts.length < 2) return null
    const lat0 = pts.reduce((a, x) => a + x.p.lat, 0) / pts.length
    const kx = Math.cos((lat0 * Math.PI) / 180)
    const xs = pts.map((x) => x.p.lng * kx), ys = pts.map((x) => -x.p.lat)
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
    const W = 320, H = 170, pad = 26
    const sc = Math.min((W - 2 * pad) / Math.max(1e-9, maxX - minX), (H - 2 * pad) / Math.max(1e-9, maxY - minY))
    const px = (i: number) => pad + (xs[i] - minX) * sc + (W - 2 * pad - (maxX - minX) * sc) / 2
    const py = (i: number) => pad + (ys[i] - minY) * sc + (H - 2 * pad - (maxY - minY) * sc) / 2
    const idx = new Map(pts.map((x, i) => [x.key, i]))
    const seq = [...(store ? ['store'] : []), ...stops.filter((s) => s.to).map((s) => s.id)]
    const curI = current ? seq.indexOf(current) : -1
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-2xl" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }} role="img" aria-label="Mapa esquemático da rota">
            <defs><pattern id="grid" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M22 0H0V22" fill="none" stroke={colors.border} strokeOpacity=".45" strokeWidth="1" /></pattern></defs>
            <rect width={W} height={H} fill="url(#grid)" rx="16" />
            {seq.slice(0, -1).map((k, i) => {
                const a = idx.get(k)!, b = idx.get(seq[i + 1])!
                const done = curI >= 0 ? i + 1 <= curI - 1 + 0 : false
                return <line key={k + i} x1={px(a)} y1={py(a)} x2={px(b)} y2={py(b)} stroke={done ? colors.textSecondary : ORANGE} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={i + 1 === curI ? '' : '2 7'} opacity={done ? 0.45 : 0.95} />
            })}
            {pts.map((x, i) => x.kind === 'store' ? (
                <g key={x.key}><circle cx={px(i)} cy={py(i)} r="14" fill={GREEN} /><text x={px(i)} y={py(i) + 4} textAnchor="middle" fontSize="12" fontWeight="900" fill="#fff">L</text></g>
            ) : x.kind === 'me' ? (
                <g key={x.key}><circle cx={px(i)} cy={py(i)} r="13" fill="#3b82f6" opacity=".22"><animate attributeName="r" values="9;17;9" dur="2s" repeatCount="indefinite" /></circle><circle cx={px(i)} cy={py(i)} r="6" fill="#3b82f6" stroke="#fff" strokeWidth="2.5" /></g>
            ) : (
                <g key={x.key}><circle cx={px(i)} cy={py(i)} r={x.id === current ? 15 : 12} fill={x.id === current ? ORANGE : colors.surface} stroke={ORANGE} strokeWidth="2.5" /><text x={px(i)} y={py(i) + 4.5} textAnchor="middle" fontSize="12" fontWeight="900" fill={x.id === current ? '#fff' : ORANGE}>{x.n}</text></g>
            ))}
        </svg>
    )
}

function Ring({ used, cap, size = 64, colors }: { used: number; cap: number; size?: number; colors: any }) {
    const r = size / 2 - 6, c = 2 * Math.PI * r, frac = Math.min(1, used / cap)
    return (
        <span className="relative inline-flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90"><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="6" /><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${c * frac} ${c}`} style={{ transition: 'stroke-dasharray .5s' }} /></svg>
            <span className="absolute text-white font-black leading-none text-center" style={{ fontSize: 15 }}>{used}<span style={{ opacity: 0.7, fontSize: 11 }}>/{cap}</span></span>
        </span>
    )
}

const STEPS = ['Aceitas', 'Loja', 'Pegar', 'Entregar'] as const
const stepIndex = (p: ReturnType<typeof phaseOf>) => (p === 'accepted' ? 0 : p === 'to_store' ? 1 : p === 'at_store' ? 2 : 3)

export default function DriverDeliveriesScreen() {
    const { colors } = useTheme()
    const { userId } = useProfile()
    const [myName, setMyName] = useState<string | null>(null)
    const soft = `${colors.border}40`
    const [state, setState] = useState<DriverState | null>(null)
    const [active, setActive] = useState<ActiveDelivery[]>([])
    const [offers, setOffers] = useState<DeliveryOffer[]>([])
    const [done, setDone] = useState<DoneToday[]>([])
    const [loaded, setLoaded] = useState(false)
    const [busy, setBusy] = useState<string | null>(null)
    const [showDone, setShowDone] = useState(false)
    const seenOffers = useRef<Set<string> | null>(null)
    const [fresh, setFresh] = useState<Set<string>>(new Set())

    const refresh = useCallback(async () => {
        if (!userId) return
        try {
            const [st, ac, of, dn] = await Promise.all([fetchDriverState(userId), fetchActive(userId), fetchOffers(), fetchDoneToday(userId)])
            setState(st); setActive(ac); setDone(dn)
            setOffers(of)
            // avisa as entregas novas (depois da primeira carga)
            const ids = new Set(of.map((o) => o.id))
            if (seenOffers.current) {
                const novas = of.filter((o) => !seenOffers.current!.has(o.id) && (!st.live || !o.store || !st.radiusKm || haversineKm(st.live, o.store) <= st.radiusKm))
                if (novas.length) {
                    setFresh((f) => new Set([...f, ...novas.map((o) => o.id)]))
                    toast(`Nova entrega: ${novas[0].storeName} · ${brl(novas[0].price)}`, { icon: '🛵' })
                    try { navigator.vibrate?.(120) } catch { /* sem vibração */ }
                    setTimeout(() => setFresh((f) => { const n = new Set(f); novas.forEach((o) => n.delete(o.id)); return n }), 20000)
                }
            }
            seenOffers.current = ids
        } finally { setLoaded(true) }
    }, [userId])

    useEffect(() => { if (userId) supabase.from('profiles').select('name').eq('id', userId).maybeSingle().then(({ data }) => setMyName((data as any)?.name || null)) }, [userId])
    useEffect(() => { refresh(); const t = setInterval(refresh, 5000); return () => clearInterval(t) }, [refresh])
    useEffect(() => {
        if (!userId) return
        const ch = supabase.channel(`driver-deliveries-${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_offers' }, () => refresh())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_requests', filter: `driver_id=eq.${userId}` }, () => refresh())
            .subscribe()
        return () => { supabase.removeChannel(ch) }
    }, [userId, refresh])

    const cap = capacityState(active.length, state?.capacity ?? 1)
    const phase = phaseOf(active)
    const store = active[0]?.store ?? null
    const ordered = useMemo(() => routeOrder(store, active), [active, store])
    const pendingStops = ordered
    const current = pendingStops[0] ?? null
    const visibleOffers = useMemo(() => withinRadius(offers, state?.live ?? null, state?.radiusKm ?? null).filter((o) => !active.some((a) => a.id === o.id)), [offers, state, active])
    // Em andamento só cabem entregas da MESMA loja enquanto o motorista ainda não saiu com os pedidos
    const canTakeMore = !!state?.online && !cap.full && phase !== 'delivering'
    const combos = useMemo(() => (canTakeMore ? suggestBatches(visibleOffers, cap.left).filter((b) => b.offers.length > 1) : []), [visibleOffers, cap.left, canTakeMore])
    const todayTotal = earnings(done)

    const run = async (key: string, fn: () => Promise<void>, ok?: string) => {
        setBusy(key)
        try { await fn(); if (ok) toast.success(ok); await refresh() } catch (e: any) { toast.error(e?.message || 'Não deu certo. Tente de novo.') } finally { setBusy(null) }
    }
    const accept = (o: DeliveryOffer) => run(`o-${o.id}`, () => acceptOffer(o, userId as string), 'Entrega aceita!')
    const acceptMany = (list: DeliveryOffer[]) => run('combo', async () => { for (const o of list) await acceptOffer(o, userId as string) }, `${list.length} entregas aceitas!`)
    const ids = active.map((a) => a.id)

    // Concluir exige estar a até 100 m do destino: usa o GPS do aparelho (em teste local, dá para marcar "estou no local")
    const finish = (d: ActiveDelivery, atDestination = false) => run(`f-${d.id}`, async () => {
        if (!d.to) throw new Error('Esta entrega está sem localização.')
        let at: LatLng = d.to
        if (!atDestination) {
            at = await new Promise<LatLng>((resolve, reject) => {
                if (!navigator.geolocation) return reject(new Error('Ative a localização para concluir.'))
                navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => reject(new Error('Ative a localização do aparelho para concluir a entrega.')), { enableHighAccuracy: true, timeout: 9000 })
            })
        }
        await completeDelivery(d.id, at)
    }, 'Entrega concluída! 🎉')

    if (!userId) return <p className="py-16 text-center text-sm" style={{ color: colors.textSecondary }}>Entre na sua conta para ver as entregas.</p>
    const eta = (to: LatLng | null, from: LatLng | null) => (to && from ? etaMinutes(haversineKm(from, to)) : null)
    const myPos = state?.live ?? null

    return (
        <div className="pb-6 flex flex-col gap-4">
            {/* ===== Resumo do dia ===== */}
            <section className="rounded-3xl p-4 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #f97316, #be123c)', boxShadow: '0 10px 30px rgba(249,115,22,0.35)' }}>
                <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <p className="text-[12px] opacity-90 flex items-center gap-1.5"><Bike size={14} /> Central de entregas</p>
                        <h1 className="text-xl font-black leading-tight truncate">Olá{myName ? `, ${String(myName).split(' ')[0]}` : ''}!</h1>
                        <p className="text-[12px] opacity-90 truncate">{state?.vehicle || 'Motorista iUser'}</p>
                    </div>
                    <button onClick={() => run('online', () => setOnline(userId, !state?.online))} aria-pressed={!!state?.online} disabled={busy === 'online'} className="h-9 px-3.5 rounded-full flex items-center gap-1.5 text-[12px] font-black transition active:scale-95" style={state?.online ? { background: '#fff', color: '#16a34a' } : { background: 'rgba(0,0,0,0.3)', color: '#fff' }}>
                        <Power size={14} /> {state?.online ? 'Online' : 'Offline'}
                    </button>
                </div>
                <div className="mt-4 flex items-center gap-4">
                    <Ring used={cap.used} cap={cap.capacity} colors={colors} />
                    <div className="grid grid-cols-2 gap-x-5 gap-y-1 flex-1">
                        <div><p className="text-[10px] uppercase font-black opacity-80">Ganho de hoje</p><p className="text-lg font-black leading-tight">{brl(todayTotal)}</p></div>
                        <div><p className="text-[10px] uppercase font-black opacity-80">Entregas hoje</p><p className="text-lg font-black leading-tight">{done.length}</p></div>
                    </div>
                </div>
                <div className="mt-3 flex items-center justify-between rounded-2xl px-3 py-2" style={{ background: 'rgba(0,0,0,0.22)' }}>
                    <span className="text-[12px] font-bold flex items-center gap-1.5"><Package size={14} /> Quantas entregas cabem na sua mochila?</span>
                    <span className="flex items-center gap-2">
                        <button aria-label="Menos" onClick={() => state && state.capacity > 1 && run('cap', () => setCapacity(userId, state.capacity - 1))} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.25)' }}><Minus size={14} /></button>
                        <b className="w-4 text-center">{state?.capacity ?? 1}</b>
                        <button aria-label="Mais" onClick={() => state && state.capacity < 8 && run('cap', () => setCapacity(userId, state.capacity + 1))} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.25)' }}><Plus size={14} /></button>
                    </span>
                </div>
            </section>

            {/* ===== A saída em andamento ===== */}
            {active.length > 0 && (
                <section className="rounded-3xl p-4 flex flex-col gap-3" style={{ background: colors.surface, border: `1.5px solid ${ORANGE}`, boxShadow: '0 6px 20px #f9731626' }}>
                    <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0"><h2 className="text-base font-black" style={{ color: colors.textPrimary }}>Sua saída · {active.length} {active.length === 1 ? 'entrega' : 'entregas'}</h2><p className="text-[11px]" style={{ color: ORANGE }}>{PHASE_LABEL[phase]}</p></div>
                        <span className="text-[12px] font-black px-2.5 py-1 rounded-full" style={{ background: `${GREEN}22`, color: '#16a34a' }}>{brl(earnings(active))}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        {STEPS.map((s, i) => { const on = i <= stepIndex(phase); return (
                            <div key={s} className="flex-1 flex flex-col items-center gap-1">
                                <span className="h-1.5 w-full rounded-full" style={{ background: on ? ORANGE : `${colors.border}80` }} />
                                <span className="text-[10px] font-black" style={{ color: i === stepIndex(phase) ? ORANGE : colors.textSecondary }}>{s}</span>
                            </div>) })}
                    </div>

                    <RouteDiagram store={store} stops={ordered} current={current?.id ?? null} me={myPos} colors={colors} />
                    <p className="text-[11px] -mt-1" style={{ color: colors.textSecondary }}>{ordered.length} parada(s) · ~{routeKm(store, ordered).toFixed(1)} km · ~{etaMinutes(routeKm(store, ordered))} min de rota</p>

                    {/* Etapas antes de sair da loja */}
                    {phase !== 'delivering' && (
                        <>
                            <div className="flex items-center gap-2.5 rounded-2xl p-3" style={{ background: soft }}>
                                <span className="w-10 h-10 rounded-2xl flex items-center justify-center text-white flex-shrink-0" style={{ background: GREEN }}><StoreIcon size={19} /></span>
                                <span className="min-w-0 flex-1"><span className="block text-[13px] font-black truncate" style={{ color: colors.textPrimary }}>{active[0].storeName}</span><span className="block text-[11px] truncate" style={{ color: colors.textSecondary }}>{shortAddress(active[0].storeAddress)}</span></span>
                                {store && <a href={wazeUrl(store)} target="_blank" rel="noreferrer" className="h-8 px-3 rounded-full text-[11px] font-black flex items-center gap-1 flex-shrink-0" style={{ background: '#33ccff33', color: '#0891b2' }}><Navigation size={12} /> Waze</a>}
                            </div>
                            {phase === 'at_store' && (
                                <div className="flex flex-col gap-1.5">
                                    <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>Confira os pedidos</p>
                                    {ordered.map((d, i) => (
                                        <div key={d.id} className="rounded-2xl p-3" style={{ background: soft }}>
                                            <p className="text-[12px] font-black" style={{ color: colors.textPrimary }}>{i + 1}. {d.customerName}</p>
                                            <ul className="mt-0.5">{itemsList(d.items).map((it, k) => <li key={k} className="text-[12px] flex items-center gap-1.5" style={{ color: colors.textSecondary }}><Check size={11} style={{ color: GREEN }} />{it}</li>)}</ul>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <button
                                onClick={() => run('step', () => (phase === 'accepted' ? leaveForStore(ids) : phase === 'to_store' ? arriveAtStore(ids) : pickUpOrders(ids)))}
                                disabled={busy === 'step'}
                                className="h-12 rounded-full text-[15px] font-black text-white flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-60" style={{ background: 'linear-gradient(135deg,#f97316,#dc2626)', boxShadow: '0 6px 18px #f9731655' }}
                            >
                                {phase === 'accepted' ? <><Navigation size={17} /> Sair para a loja</> : phase === 'to_store' ? <><MapPin size={17} /> Cheguei na loja</> : <><Package size={17} /> Peguei os {active.length} {active.length === 1 ? 'pedido' : 'pedidos'}</>}
                            </button>
                        </>
                    )}

                    {/* Entregando: a próxima parada em destaque */}
                    {phase === 'delivering' && current && (() => {
                        const pay = paymentRecap(current.paymentMethod, current.cashChangeFor)
                        const idx = ordered.findIndex((d) => d.id === current.id) + 1
                        const e = eta(current.to, myPos)
                        return (
                            <div className="rounded-3xl p-4 flex flex-col gap-3" style={{ background: soft }}>
                                <div className="flex items-center gap-2">
                                    <span className="w-9 h-9 rounded-full flex items-center justify-center text-white font-black flex-shrink-0" style={{ background: ORANGE }}>{idx}</span>
                                    <div className="min-w-0 flex-1"><p className="text-[11px] font-black uppercase" style={{ color: ORANGE }}>Próxima entrega · {idx} de {ordered.length}</p><p className="text-[16px] font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{current.customerName}</p></div>
                                    {e != null && <span className="text-[11px] font-black px-2 py-1 rounded-full flex items-center gap-1" style={{ background: `${colors.border}80`, color: colors.textPrimary }}><Clock3 size={11} /> ~{e} min</span>}
                                </div>
                                <p className="text-[15px] font-bold leading-snug" style={{ color: colors.textPrimary }}>{current.address}</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {current.to && <a href={wazeUrl(current.to)} target="_blank" rel="noreferrer" className="h-10 rounded-full text-[12px] font-black flex items-center justify-center gap-1.5" style={{ background: '#33ccff33', color: '#0891b2' }}><Navigation size={14} /> Waze</a>}
                                    {current.to && <a href={mapsUrl(current.to)} target="_blank" rel="noreferrer" className="h-10 rounded-full text-[12px] font-black flex items-center justify-center gap-1.5" style={{ background: '#4285f433', color: '#2563eb' }}><MapPin size={14} /> Google Maps</a>}
                                </div>
                                <ul className="rounded-2xl p-3" style={{ background: colors.surface }}>
                                    {itemsList(current.items).map((it, k) => <li key={k} className="text-[12px] flex items-center gap-1.5" style={{ color: colors.textPrimary }}><Package size={11} style={{ color: ORANGE }} />{it}</li>)}
                                </ul>
                                <div className="rounded-2xl px-3 py-2 text-[12px] font-bold" style={pay.collect ? { background: '#f59e0b22', color: '#b45309' } : { background: `${GREEN}22`, color: '#16a34a' }}>{pay.label}{pay.note ? ` · ${pay.note}` : ''}</div>
                                <button onClick={() => finish(current)} disabled={busy === `f-${current.id}`} className="h-12 rounded-full text-[15px] font-black text-white flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-60" style={{ background: GREEN, boxShadow: '0 6px 18px #22c55e55' }}><Check size={18} strokeWidth={3} /> Entreguei</button>
                                {isLocalDevOnly() && <button onClick={() => finish(current, true)} className="text-[11px] font-bold underline self-center" style={{ color: colors.textSecondary }}>Estou no local (teste)</button>}
                                {ordered.length > 1 && (
                                    <div className="flex flex-col gap-1.5 pt-1">
                                        <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>Depois</p>
                                        {ordered.slice(1).map((d, i) => (
                                            <div key={d.id} className="flex items-center gap-2.5 rounded-2xl px-3 py-2" style={{ background: colors.surface }}>
                                                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0" style={{ background: `${ORANGE}22`, color: ORANGE }}>{i + 2}</span>
                                                <span className="min-w-0 flex-1"><span className="block text-[12px] font-black truncate" style={{ color: colors.textPrimary }}>{d.customerName}</span><span className="block text-[11px] truncate" style={{ color: colors.textSecondary }}>{shortAddress(d.address)}</span></span>
                                                {d.to && ordered[i].to && <span className="text-[10px] font-bold flex-shrink-0" style={{ color: colors.textSecondary }}>{haversineKm(ordered[i].to as LatLng, d.to).toFixed(1)} km</span>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    })()}
                </section>
            )}

            {/* ===== Entregas disponíveis ===== */}
            <section>
                <div className="flex items-end justify-between mb-2.5">
                    <h2 className="flex items-center gap-1.5 text-[17px] font-black" style={{ color: colors.textPrimary }}><Zap size={17} style={{ color: ORANGE }} /> Entregas disponíveis {visibleOffers.length > 0 && <span className="text-[12px] px-2 py-0.5 rounded-full text-white" style={{ background: GREEN }}>{visibleOffers.length}</span>}</h2>
                </div>
                {!state?.online && <p className="rounded-2xl p-3 text-[13px] font-bold mb-3" style={{ background: '#f59e0b22', color: '#b45309' }}>Você está offline. Ative “Online” para receber entregas perto de você.</p>}
                {state?.online && cap.full && <p className="rounded-2xl p-3 text-[13px] font-bold mb-3" style={{ background: `${ORANGE}22`, color: '#c2410c' }}>Sua mochila está cheia ({cap.used}/{cap.capacity}). Conclua entregas para aceitar novas.</p>}
                {state?.online && !cap.full && phase === 'delivering' && <p className="rounded-2xl p-3 text-[13px] font-bold mb-3" style={{ background: `${colors.border}50`, color: colors.textSecondary }}>Você já saiu da loja: novas entregas ficam para a próxima saída.</p>}

                {combos.length > 0 && (
                    <div className="flex flex-col gap-2.5 mb-3">
                        {combos.slice(0, 2).map((b, i) => (
                            <div key={i} className="rounded-3xl p-4 text-white" style={{ background: 'linear-gradient(135deg,#7c3aed,#be185d)', boxShadow: '0 8px 22px rgba(124,58,237,0.3)' }}>
                                <p className="text-[11px] font-black uppercase flex items-center gap-1.5 opacity-90"><Layers size={13} /> Combo sugerido · cabe na sua mochila</p>
                                <p className="text-lg font-black leading-tight mt-0.5">{b.offers.length} entregas · {brl(b.total)}</p>
                                <p className="text-[12px] opacity-90">{b.offers[0].storeName} · ~{b.km.toFixed(1)} km de rota · ~{etaMinutes(b.km)} min · {brl(b.perKm)}/km</p>
                                <button onClick={() => acceptMany(b.offers)} disabled={busy === 'combo'} className="mt-3 h-11 w-full rounded-full text-[14px] font-black flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-60" style={{ background: '#fff', color: '#6d28d9' }}><Check size={16} strokeWidth={3} /> Aceitar as {b.offers.length}</button>
                            </div>
                        ))}
                    </div>
                )}

                {!loaded ? [0, 1].map((i) => <span key={i} className="block h-28 rounded-3xl animate-pulse mb-2.5" style={{ background: `${colors.border}40` }} />) : visibleOffers.length === 0 ? (
                    <div className="rounded-3xl p-8 text-center" style={{ background: colors.surface, border: `1px dashed ${colors.border}` }}>
                        <Flame size={30} className="mx-auto mb-2" style={{ color: colors.textSecondary }} />
                        <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Nenhuma entrega aberta agora</p>
                        <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Quando uma loja perto de você aceitar um pedido, a entrega aparece aqui na hora.</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2.5">
                        {visibleOffers.map((o) => {
                            const e = o.store ? etaMinutes(o.km ?? 1.5) : null
                            const toStore = myPos && o.store ? haversineKm(myPos, o.store) : null
                            return (
                                <div key={o.id} className="rounded-3xl p-4 transition" style={{ background: colors.surface, border: fresh.has(o.id) ? `1.5px solid ${GREEN}` : `1px solid ${colors.border}`, boxShadow: fresh.has(o.id) ? '0 6px 20px #22c55e30' : 'none' }}>
                                    <div className="flex items-start gap-3">
                                        <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-white flex-shrink-0" style={{ background: GREEN }}><StoreIcon size={20} /></span>
                                        <div className="min-w-0 flex-1">
                                            <p className="flex items-center gap-1.5 text-[14px] font-black truncate" style={{ color: colors.textPrimary }}>{o.storeName}{fresh.has(o.id) && <span className="text-[9px] px-1.5 py-0.5 rounded-full text-white" style={{ background: GREEN }}>NOVA</span>}</p>
                                            <p className="text-[12px] truncate" style={{ color: colors.textSecondary }}>{itemsList(o.items).slice(0, 2).join(', ') || 'Pedido da loja'}</p>
                                            <p className="text-[12px] flex items-center gap-1 mt-0.5 truncate" style={{ color: colors.textPrimary }}><MapPin size={11} style={{ color: ORANGE }} /> {shortAddress(o.address)}</p>
                                        </div>
                                        <div className="text-right flex-shrink-0"><p className="text-lg font-black leading-none" style={{ color: '#16a34a' }}>{brl(o.price)}</p><p className="text-[10px] mt-1" style={{ color: colors.textSecondary }}>{o.km != null ? `${o.km.toFixed(1)} km` : ''}{e ? ` · ~${e} min` : ''}</p></div>
                                    </div>
                                    <div className="mt-3 flex items-center gap-2">
                                        {toStore != null && <span className="text-[11px] font-bold px-2 py-1 rounded-full" style={{ background: soft, color: colors.textSecondary }}>Loja a {toStore.toFixed(1)} km de você</span>}
                                        <span className="flex-1" />
                                        <button onClick={() => accept(o)} disabled={!canTakeMore || busy === `o-${o.id}`} className="h-10 px-5 rounded-full text-[13px] font-black text-white flex items-center gap-1.5 transition active:scale-95 disabled:opacity-40" style={{ background: ORANGE }}><Check size={15} strokeWidth={3} /> Aceitar</button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </section>

            {/* ===== Hoje ===== */}
            {done.length > 0 && (
                <section className="rounded-3xl overflow-hidden" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                    <button onClick={() => setShowDone((v) => !v)} className="w-full flex items-center justify-between p-4 text-left">
                        <span><span className="block text-base font-black" style={{ color: colors.textPrimary }}>Entregas de hoje</span><span className="block text-[11px]" style={{ color: colors.textSecondary }}>{done.length} concluídas · <b style={{ color: '#16a34a' }}>{brl(todayTotal)}</b></span></span>
                        {showDone ? <ChevronUp size={20} style={{ color: colors.textSecondary }} /> : <ChevronDown size={20} style={{ color: colors.textSecondary }} />}
                    </button>
                    {showDone && <div className="px-4 pb-4 flex flex-col gap-1.5">{done.map((d) => (
                        <div key={d.id} className="flex items-center gap-2.5 rounded-2xl px-3 py-2" style={{ background: soft }}>
                            <span className="w-7 h-7 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: '#3b82f6' }}><Check size={14} strokeWidth={3} /></span>
                            <span className="min-w-0 flex-1"><span className="block text-[12px] font-black truncate" style={{ color: colors.textPrimary }}>{d.customerName}</span><span className="block text-[11px] truncate" style={{ color: colors.textSecondary }}>{shortAddress(d.address)}</span></span>
                            <b className="text-[12px]" style={{ color: '#16a34a' }}>{brl(d.price)}</b>
                        </div>))}</div>}
                </section>
            )}
        </div>
    )
}
