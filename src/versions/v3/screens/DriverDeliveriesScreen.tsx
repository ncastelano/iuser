// src/versions/v3/screens/DriverDeliveriesScreen.tsx
//
// CENTRAL DE ENTREGAS (3.0): o painel do motorista iUser para as ENTREGAS DE LOJA (pizzaria, lanchonete...). Entrega aparece "do nada" para quem está online
// no raio; o motorista aceita as que quiser — qualquer uma — dentro do que CABE na mochila (a capacidade dele, conferida pelo banco) e pode pegar um COMBO
// (várias entregas perto uma da outra). Depois a tela GUIA a saída: ir à loja → chegar → conferir e pegar os pedidos → entregar um por um, na melhor ordem, com
// o endereço, o que levar (itens, troco, maquininha) e links para o Waze e o Google Maps. Em cima, o resumo do dia (ganho, entregas, mochila).
// Só apresentação: regras em `modules/deliveries` (puras e testadas), quem pode o quê é do banco.
//
// PERCURSO DO MOTORISTA = o modo mapa-primeiro (view 'map'): com uma saída em andamento ele tem TUDO de que precisa para trabalhar sem sair dele — mapa e guia, conferência dos pedidos
// (pronto ou em preparo), código de retirada, "Estou no local", "Entreguei", progresso e ganho da saída — e NÃO mostra ofertas (nem "novas entregas" nem alerta): elas só voltam na
// Central quando a saída acaba, junto com o resumo dela. A tela do celular fica acesa (wake lock) enquanto ele está no Percurso.
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from '@/lib/toast'
import { Bike, Check, ChevronDown, DoorOpen, ChevronUp, Clock3, Flame, Layers, MapPin, Minus, Navigation, Package, Plus, Power, Sparkles, Star, Store as StoreIcon, Zap } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { isLocalDevOnly } from '@/lib/devOnly'
import { fetchOptimizedRoute, fetchRoadPath } from '@/lib/mapboxRoute'
import DeliveryNavMap, { type NavStop, type NavTarget } from '@/components/deliveries/DeliveryNavMap'
import {
    acceptOffer, arriveAtDestination, arriveAtStore, brl, capacityState, completeDelivery, earnings, etaMinutes, fetchActive, fetchDriverState, fetchDoneToday, fetchMyReviews, fetchOffers, haversineKm, itemsList,
    leaveForStore, mapsUrl, paymentRecap, phaseOf, pickUpOrders, PHASE_LABEL, routeKm, routeOrder, setCapacity, setCapacityUnits, setOnline, unitsState, fitsUnits, loadLabel, shortAddress, suggestBatches, wazeUrl, withinRadius,
    type ActiveDelivery, type DeliveryOffer, type DoneToday, type DriverState, type LatLng, type MyReviews,
} from '@/modules/deliveries'

/** GPS de teste (só LOCAL): dentro do /tres-telas, ou em qualquer aba com `localStorage.iuser_dev_gps = 1` */
const devGps = () => isLocalDevOnly() && typeof window !== 'undefined' && (window.parent !== window || !!window.localStorage.getItem('iuser_dev_gps'))

const ORANGE = '#f97316'
const GREEN = '#22c55e'

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
    // A SAÍDA em andamento (do 1º aceite até a última entrega): quantas entregas, quanto vale, desde quando. Ao acabar vira o resumo no topo da Central.
    const [runIds, setRunIds] = useState<Record<string, number>>({})
    const runStart = useRef<number | null>(null)
    const [summary, setSummary] = useState<{ count: number; earn: number; minutes: number } | null>(null)
    // Com uma saída em andamento a tela vira NAVEGAÇÃO (mapa em tela cheia + folha de ação); a Central (ofertas, resumo, histórico) fica a um toque
    const [view, setView] = useState<'map' | 'central'>('central')
    const [sheetOpen, setSheetOpen] = useState(false)
    const hadActive = useRef(false)
    const [codeOpen, setCodeOpen] = useState(false)
    const [codeValue, setCodeValue] = useState('')
    const [codeError, setCodeError] = useState<string | null>(null)
    const [reviews, setReviews] = useState<MyReviews | null>(null)
    const [optSeq, setOptSeq] = useState<Record<string, number> | null>(null)
    const anchor = useRef<HTMLDivElement>(null)
    const [shellTop, setShellTop] = useState('0px')   // onde acaba a ilha (a var --shell-top vive na casca; o portal vai para o body e precisa do valor)
    useEffect(() => { if (anchor.current) setShellTop(getComputedStyle(anchor.current).getPropertyValue('--shell-top').trim() || '0px') }, [view])
    const simLive = useRef<{ pos: LatLng; at: number } | null>(null)   // GPS de teste: a posição simulada vale mais que a que o banco devolve (que chega atrasada e fazia o marcador voltar um passo)
    const seenOffers = useRef<Set<string> | null>(null)
    const [fresh, setFresh] = useState<Set<string>>(new Set())

    const refresh = useCallback(async () => {
        if (!userId) return
        try {
            const [st, ac, of, dn] = await Promise.all([fetchDriverState(userId), fetchActive(userId), fetchOffers(), fetchDoneToday(userId)])
            const keep = simLive.current && Date.now() - simLive.current.at < 6000 ? simLive.current.pos : null
            setState(keep ? { ...st, live: keep } : st); setActive(ac); setDone(dn)
            setOffers(of)
            // avisa as entregas novas (depois da primeira carga)
            const ids = new Set(of.map((o) => o.id))
            if (seenOffers.current) {
                const novas = of.filter((o) => !seenOffers.current!.has(o.id) && (!st.live || !o.store || !st.radiusKm || haversineKm(st.live, o.store) <= st.radiusKm))
                if (novas.length && ac.length === 0) {   // durante o Percurso (saída em andamento) NÃO avisa: as ofertas esperam a saída acabar
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
    const loadReviews = useCallback(() => { if (userId) fetchMyReviews(userId).then(setReviews).catch(() => {}) }, [userId])
    useEffect(() => { loadReviews() }, [loadReviews])
    useEffect(() => {   // a loja avaliou a entrega: aviso na hora
        if (!userId) return
        const ch = supabase.channel(`driver-reviews-${userId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_reviews', filter: `reviewee_id=eq.${userId}` }, (payload: any) => {
                const r = payload.new || {}
                toast(`⭐ A loja te avaliou com ${r.rating}★${r.comment ? ` — “${String(r.comment).slice(0, 60)}”` : ''}`, { duration: 7000 })
                loadReviews()
            }).subscribe()
        return () => { supabase.removeChannel(ch) }
    }, [userId, loadReviews])
    useEffect(() => { refresh(); const t = setInterval(refresh, 3000); return () => clearInterval(t) }, [refresh])
    useEffect(() => {
        if (!userId) return
        const ch = supabase.channel(`driver-deliveries-${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_offers' }, () => refresh())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_requests', filter: `driver_id=eq.${userId}` }, () => refresh())
            .subscribe()
        return () => { supabase.removeChannel(ch) }
    }, [userId, refresh])

    useEffect(() => {   // saiu a 1ª entrega aceita: navegação; acabou a saída: central
        if (active.length > 0 && !hadActive.current) setView('map')
        if (active.length === 0) setView('central')
        hadActive.current = active.length > 0
    }, [active.length])
    useEffect(() => {
        if (active.length > 0) {
            if (runStart.current == null) { runStart.current = Date.now(); setSummary(null) }
            setRunIds((prev) => { let changed = false; const n = { ...prev }; active.forEach((a) => { if (n[a.id] == null) { n[a.id] = a.price; changed = true } }); return changed ? n : prev })
        } else if (runStart.current != null && loaded) {
            const delivered = Object.keys(runIds).filter((id) => done.some((d) => d.id === id))
            if (delivered.length) setSummary({ count: delivered.length, earn: delivered.reduce((a, id) => a + runIds[id], 0), minutes: Math.max(1, Math.round((Date.now() - runStart.current) / 60000)) })
            runStart.current = null; setRunIds({})
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, done])
    // A tela fica ACESA no Percurso (o motorista dirige e olha o celular)
    const inPercurso = active.length > 0 && view === 'map'
    useEffect(() => {
        if (!inPercurso) return
        let lock: { release?: () => Promise<void> } | null = null
        let off = false
        const get = async () => { try { lock = await (navigator as any).wakeLock?.request('screen') } catch { /* sem suporte: segue normal */ } }
        get()
        const vis = () => { if (document.visibilityState === 'visible' && !off) get() }
        document.addEventListener('visibilitychange', vis)
        return () => { off = true; document.removeEventListener('visibilitychange', vis); lock?.release?.().catch(() => {}) }
    }, [inPercurso])
    const cap = capacityState(active.length, state?.capacity ?? 1)
    const usedUnits = active.reduce((a, d) => a + d.units, 0)
    const vol = unitsState(usedUnits, state?.capacityUnits ?? null)
    const phase = phaseOf(active)
    useEffect(() => { setSheetOpen(phase === 'at_store') }, [phase])   // na loja a folha abre sozinha: é a hora de conferir os pedidos
    const store = active[0]?.store ?? null
    const naive = useMemo(() => routeOrder(store, active), [active, store])
    // ROTA OTIMIZADA: com 2+ paradas a ordem vem da Optimization API do Mapbox (ruas de verdade, mão única), não da linha reta; falhou: vizinho mais próximo
    const idsKey = active.map((a) => a.id).sort().join(',')
    useEffect(() => {
        if (!store || active.length < 2) { setOptSeq(null); return }
        if (optSeq && active.every((a) => optSeq[a.id] != null)) return   // já otimizada: o que sobrar segue a mesma ordem
        let off = false
        fetchOptimizedRoute(store.lat, store.lng, active.filter((a) => a.to).map((a) => ({ id: a.id, lat: (a.to as LatLng).lat, lng: (a.to as LatLng).lng })))
            .then((r) => { if (!off && r) setOptSeq(Object.fromEntries(r.map((x) => [x.id, x.sequence]))) })
        return () => { off = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idsKey, store?.lat, store?.lng])
    const optimized = !!optSeq && active.length >= 2 && active.every((a) => optSeq[a.id] != null)
    const ordered = useMemo(() => (optimized && optSeq ? [...naive].sort((a, b) => optSeq[a.id] - optSeq[b.id]) : naive), [naive, optimized, optSeq])
    const savedKm = optimized ? Math.max(0, routeKm(store, naive) - routeKm(store, ordered)) : 0
    const pendingStops = ordered
    const current = pendingStops[0] ?? null
    const visibleOffers = useMemo(() => withinRadius(offers, state?.live ?? null, state?.radiusKm ?? null).filter((o) => !active.some((a) => a.id === o.id)), [offers, state, active])
    // Em andamento só cabem entregas da MESMA loja enquanto o motorista ainda não saiu com os pedidos
    const canTakeMore = !!state?.online && !cap.full && !vol.full && phase !== 'delivering'
    const combos = useMemo(() => (canTakeMore ? suggestBatches(visibleOffers, cap.left, 3.5, 3, vol.left).filter((b) => b.offers.length > 1) : []), [visibleOffers, cap.left, canTakeMore, vol.left])
    const todayTotal = earnings(done)

    const run = async (key: string, fn: () => Promise<void>, ok?: string) => {
        setBusy(key)
        try { await fn(); if (ok) toast.success(ok); await refresh() } catch (e: any) { toast.error(e?.message || 'Não deu certo. Tente de novo.') } finally { setBusy(null) }
    }
    const accept = (o: DeliveryOffer) => run(`o-${o.id}`, () => acceptOffer(o, userId as string), 'Entrega aceita!')
    const acceptMany = (list: DeliveryOffer[]) => run('combo', async () => { for (const o of list) await acceptOffer(o, userId as string) }, `${list.length} entregas aceitas!`)
    const ids = active.map((a) => a.id)

    // Duas etapas na porta do cliente: "Estou no local" (avisa o cliente; o servidor confere que está a até 150 m) e, depois, "Entreguei" (até 100 m). Usa o GPS do aparelho (em teste local, dá para marcar "estou no local")
    const whereAmI = async (d: ActiveDelivery, atDestination: boolean): Promise<LatLng> => {
        if (!d.to) throw new Error('Esta entrega está sem localização.')
        const stagePos = state?.live   // TEATRO: dentro do /tres-telas o GPS simulado (que anda até a parada) vale como a posição do aparelho
        if (atDestination) return d.to
        if (devGps() && stagePos) return stagePos
        return new Promise<LatLng>((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error('Ative a localização para avisar o cliente e concluir.'))
            navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => reject(new Error('Ative a localização do aparelho para avisar o cliente e concluir a entrega.')), { enableHighAccuracy: true, timeout: 9000 })
        })
    }
    const arriveDoor = (d: ActiveDelivery, atDestination = false) => run(`a-${d.id}`, async () => { await arriveAtDestination(d.id, await whereAmI(d, atDestination)) }, `${firstName(d.customerName)} foi avisado(a) de que você chegou 🚪`)
    const finish = (d: ActiveDelivery, atDestination = false) => run(`f-${d.id}`, async () => { await completeDelivery(d.id, await whereAmI(d, atDestination)) }, 'Entrega concluída! 🎉')

    const firstName = (n: string) => (n || 'O cliente').trim().split(/\s+/)[0]
    const eta = (to: LatLng | null, from: LatLng | null) => (to && from ? etaMinutes(haversineKm(from, to)) : null)
    const myPos = state?.live ?? null
    // O mapa guia o motorista até o ALVO da vez: a loja (até pegar os pedidos) e depois cada parada, na ordem da rota
    const navTarget: NavTarget | null = active.length === 0 ? null
        : phase !== 'delivering' ? (store ? { id: 'store', kind: 'store', lat: store.lat, lng: store.lng, label: `${active[0].storeName} · ${shortAddress(active[0].storeAddress)}` } : null)
        : current?.to ? { id: current.id, kind: 'stop', lat: current.to.lat, lng: current.to.lng, label: current.address } : null
    // TEATRO (só local, só dentro do /tres-telas): o "GPS" ANDA PELAS RUAS até o ALVO que a tela mostra (a loja a caminho; depois cada parada) — segue a rota do Mapbox, ~58 km/h, uma posição por segundo
    const gpsRef = useRef({ phase, target: navTarget, pos: state?.live ?? null })
    gpsRef.current = { phase, target: navTarget, pos: state?.live ?? null }
    const gpsPath = useRef<{ key: string; pts: [number, number][]; cum: number[]; dist: number } | null>(null)
    const gpsLoading = useRef(false)
    useEffect(() => {
        if (!userId || !devGps()) return
        const SPEED_M_S = 16
        const t = setInterval(() => {
            const { phase: ph, target, pos } = gpsRef.current
            if (!target || !pos || (ph !== 'to_store' && ph !== 'delivering')) return
            const key = `${ph}:${target.id}`
            let r = gpsPath.current
            if (!r || r.key !== key) {
                if (gpsLoading.current) return
                gpsLoading.current = true
                fetchRoadPath([pos.lng, pos.lat], [target.lng, target.lat]).then((pts) => {
                    const path = pts || [[pos.lng, pos.lat], [target.lng, target.lat]]
                    const cum = [0]
                    for (let i = 0; i < path.length - 1; i++) cum.push(cum[i] + haversineKm({ lat: path[i][1], lng: path[i][0] }, { lat: path[i + 1][1], lng: path[i + 1][0] }) * 1000)
                    gpsPath.current = { key, pts: path, cum, dist: 0 }
                }).finally(() => { gpsLoading.current = false })
                return
            }
            r.dist += SPEED_M_S
            const total = r.cum[r.cum.length - 1]
            let next: LatLng
            if (r.dist >= total) next = { lat: target.lat, lng: target.lng }
            else {
                let i = 0
                while (r.cum[i + 1] < r.dist) i++
                const seg = r.cum[i + 1] - r.cum[i]
                const f = seg ? (r.dist - r.cum[i]) / seg : 1
                next = { lng: r.pts[i][0] + (r.pts[i + 1][0] - r.pts[i][0]) * f, lat: r.pts[i][1] + (r.pts[i + 1][1] - r.pts[i][1]) * f }
            }
            if (haversineKm(pos, next) * 1000 < 0.5) return
            simLive.current = { pos: next, at: Date.now() }
            setState((st) => (st ? { ...st, live: next } : st))
            supabase.from('driver_pricing').update({ live_lat: next.lat, live_lng: next.lng, live_updated_at: new Date().toISOString() }).eq('driver_id', userId).then(() => {})
        }, 1000)
        return () => clearInterval(t)
    }, [userId])
    if (!userId) return <p className="py-16 text-center text-sm" style={{ color: colors.textSecondary }}>Entre na sua conta para ver as entregas.</p>
    const navStops: NavStop[] = ordered.filter((d) => d.to).map((d, i) => ({ id: d.id, n: i + 1, to: d.to as LatLng, label: d.customerName, address: d.address }))
    // A ação principal da etapa (a mesma no cartão e no mapa ampliado)
    const confirmCode = async () => {
        if (codeValue.length < 4) { setCodeError('Digite os 4 números que a loja informou.'); return }
        setBusy('step')
        try {
            const r = await pickUpOrders(ids, codeValue)
            if (r.ok) { setCodeOpen(false); setCodeValue(''); setCodeError(null); toast.success('Retirada confirmada! Boa entrega.'); await refresh() }
            else if (r.error === 'code_locked') setCodeError(`Muitas tentativas erradas. Tente de novo em ${Math.max(1, Math.ceil((r.retryInS ?? 300) / 60))} min ou peça à loja para conferir.`)
            else setCodeError(`Código incorreto${r.attemptsLeft != null ? ` — restam ${r.attemptsLeft} tentativas` : ''}. Confira com a loja.`)
        } catch (e: any) { setCodeError(e?.message || 'Não foi possível confirmar.') } finally { setBusy(null) }
    }
    const readyN = active.filter((a) => a.orderStatus == null || a.orderStatus === 'ready').length
    const allReady = readyN === active.length
    const runTotal = Math.max(Object.keys(runIds).length, active.length)
    const runDone = Math.max(0, runTotal - active.length)
    const runEarn = Object.values(runIds).reduce((a, v) => a + v, 0) || earnings(active)
    const remKm = phase === 'delivering' ? routeKm(myPos ?? store, ordered) : 0
    const loadSummary = active.length > 0 ? loadLabel(active.reduce((a, d) => a + d.itemsCount, 0), usedUnits) : ''
    // Na porta: o botão "Estou no local" avisa o cliente; o servidor só aceita a até 150 m do endereço, então a tela mostra o quanto falta
    const doorM = current?.to && myPos ? Math.round(haversineKm(myPos, current.to) * 1000) : null
    const doorHint = doorM == null ? 'Chegando ao endereço, avise o cliente.' : doorM <= 150 ? `Você está a ${doorM} m: avise o cliente que chegou.` : `Falta ${doorM >= 1000 ? `${(doorM / 1000).toFixed(1).replace('.', ',')} km` : `${doorM} m`} para o endereço (chegue a até 150 m para avisar).`
    const primaryAction = active.length === 0 ? null : phase === 'at_store' ? (
        codeOpen ? (
            <div className="flex flex-col gap-2 w-full rounded-2xl p-3" style={{ background: `${ORANGE}12`, border: `1.5px solid ${ORANGE}` }}>
                <p className="text-[12px] font-black" style={{ color: colors.textPrimary }}>Código de retirada <span className="font-bold" style={{ color: colors.textSecondary }}>— a loja informa depois de conferir os {active.length} {active.length === 1 ? 'pedido' : 'pedidos'} ({loadSummary})</span></p>
                <input value={codeValue} onChange={(e) => { setCodeValue(e.target.value.replace(/\D/g, '').slice(0, 4)); setCodeError(null) }} inputMode="numeric" autoComplete="one-time-code" placeholder="0000" aria-label="Código de retirada" maxLength={4}
                    className="h-14 rounded-2xl text-center text-3xl font-black tracking-[0.6em] outline-none" style={{ background: colors.surface, color: colors.textPrimary, border: `1.5px solid ${codeError ? '#ef4444' : colors.border}` }} />
                {codeError && <p className="text-[12px] font-bold" style={{ color: '#ef4444' }}>{codeError}</p>}
                <div className="flex gap-2">
                    <button onClick={() => { setCodeOpen(false); setCodeValue(''); setCodeError(null) }} className="h-11 px-4 rounded-full text-[13px] font-black" style={{ background: `${colors.border}60`, color: colors.textPrimary }}>Voltar</button>
                    <button onClick={confirmCode} disabled={busy === 'step' || codeValue.length < 4} className="flex-1 h-11 rounded-full text-[14px] font-black text-white flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: GREEN }}><Check size={16} strokeWidth={3} /> Confirmar retirada</button>
                </div>
            </div>
        ) : (
            <div className="flex flex-col gap-1.5">
                <button onClick={() => setCodeOpen(true)} disabled={!allReady} className="h-12 rounded-full text-[15px] font-black text-white flex items-center justify-center gap-2 transition active:scale-95 w-full disabled:opacity-45" style={{ background: 'linear-gradient(135deg,#f97316,#dc2626)', boxShadow: allReady ? '0 6px 18px #f9731655' : 'none' }}>
                    <Package size={17} /> Peguei os {active.length} {active.length === 1 ? 'pedido' : 'pedidos'}
                </button>
                {!allReady && <p className="text-[11px] font-black text-center" style={{ color: '#b45309' }}>⏳ Esperando a loja marcar pronto: {readyN} de {active.length}</p>}
            </div>
        )
    ) : phase !== 'delivering' ? (
        <button
            onClick={() => run('step', async () => {
                // só as entregas que ainda não registraram a etapa (aceitar mais uma depois de sair deixa a saída com etapas diferentes; o banco recusa reescrever uma etapa)
                const toLeave = active.filter((a) => !a.enRoute).map((a) => a.id)
                const toArrive = active.filter((a) => !a.arrived).map((a) => a.id)
                if (phase === 'accepted') await leaveForStore(toLeave)
                else { if (toLeave.length) await leaveForStore(toLeave); if (toArrive.length) await arriveAtStore(toArrive) }
            })}
            disabled={busy === 'step'}
            className="h-12 rounded-full text-[15px] font-black text-white flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-60 w-full" style={{ background: 'linear-gradient(135deg,#f97316,#dc2626)', boxShadow: '0 6px 18px #f9731655' }}
        >
            {phase === 'accepted' ? <><Navigation size={17} /> Sair para a loja</> : <><MapPin size={17} /> Cheguei na loja</>}
        </button>
    ) : current && !current.atDoor ? (
        <div className="flex flex-col gap-1.5">
            <button onClick={() => arriveDoor(current)} disabled={busy === `a-${current.id}`} className="h-12 rounded-full text-[15px] font-black text-white flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-60 w-full" style={{ background: 'linear-gradient(135deg,#f97316,#dc2626)', boxShadow: '0 6px 18px #f9731655' }}><DoorOpen size={18} /> Estou no local</button>
            <p className="text-[11px] font-bold text-center" style={{ color: colors.textSecondary }}>{doorHint}</p>
        </div>
    ) : current ? (
        <div className="flex flex-col gap-1.5">
            <p className="text-[12px] font-black text-center flex items-center justify-center gap-1.5" style={{ color: '#16a34a' }}><Check size={14} strokeWidth={3} /> {firstName(current.customerName)} foi avisado(a). Entregue o pedido e confirme.</p>
            <button onClick={() => finish(current)} disabled={busy === `f-${current.id}`} className="h-12 rounded-full text-[15px] font-black text-white flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-60 w-full" style={{ background: GREEN, boxShadow: '0 6px 18px #22c55e55' }}><Check size={18} strokeWidth={3} /> Entreguei</button>
        </div>
    ) : null

    return (
        <div className={active.length > 0 && view === 'map' ? 'hidden' : 'pb-6 flex flex-col gap-4'}>   {/* com a navegação aberta a Central não existe na página (só o mapa e a folha): nem as ofertas atrás dela ficam clicáveis */}
            <div ref={anchor} aria-hidden className="h-0" />
            {/* ===== Saída concluída: o resumo aparece quando a corrida acaba (e só então as ofertas voltam à vista) ===== */}
            {summary && active.length === 0 && (
                <section className="rounded-3xl p-4 flex items-center gap-3" style={{ background: `${GREEN}18`, border: `1.5px solid ${GREEN}` }}>
                    <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-white flex-shrink-0" style={{ background: GREEN }}><Check size={22} strokeWidth={3} /></span>
                    <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-black" style={{ color: colors.textPrimary }}>Saída concluída! 🎉</p>
                        <p className="text-[12px] font-bold" style={{ color: colors.textSecondary }}>{summary.count} {summary.count === 1 ? 'entrega' : 'entregas'} · {brl(summary.earn)} · {summary.minutes} min</p>
                    </div>
                    <button onClick={() => setSummary(null)} className="h-8 px-3 rounded-full text-[12px] font-black flex-shrink-0" style={{ background: `${colors.border}60`, color: colors.textPrimary }}>Ok</button>
                </section>
            )}
            {/* ===== Resumo do dia ===== */}
            <section className="rounded-3xl p-4 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #f97316, #be123c)', boxShadow: '0 10px 30px rgba(249,115,22,0.35)' }}>
                <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <p className="text-[12px] opacity-90 flex items-center gap-1.5"><Bike size={14} /> Central de entregas</p>
                        <h1 className="text-xl font-black leading-tight truncate">Olá{myName ? `, ${String(myName).split(' ')[0]}` : ''}!</h1>
                        <p className="text-[12px] opacity-90 truncate">{state?.vehicle || 'Motorista iUser'}{reviews && reviews.count > 0 && reviews.avg != null ? ` · ★ ${reviews.avg.toFixed(1).replace('.', ',')} (${reviews.count})` : ''}</p>
                    </div>
                    <button onClick={() => run('online', () => setOnline(userId, !state?.online))} aria-pressed={!!state?.online} disabled={busy === 'online'} className="h-9 px-3.5 rounded-full flex items-center gap-1.5 text-[12px] font-black transition active:scale-95" style={state?.online ? { background: '#fff', color: '#16a34a' } : { background: 'rgba(0,0,0,0.3)', color: '#fff' }}>
                        <Power size={14} /> {!state ? '…' : state.online ? 'Online' : 'Offline'}
                    </button>
                </div>
                <div className="mt-4 flex items-center gap-4">
                    <div style={{ opacity: state ? 1 : 0.5 }}><Ring used={cap.used} cap={cap.capacity} colors={colors} /></div>
                    <div className="grid grid-cols-2 gap-x-5 gap-y-1 flex-1">
                        <div><p className="text-[10px] uppercase font-black opacity-80">Ganho de hoje</p><p className="text-lg font-black leading-tight">{brl(todayTotal)}</p></div>
                        <div><p className="text-[10px] uppercase font-black opacity-80">Entregas hoje</p><p className="text-lg font-black leading-tight">{done.length}</p></div>
                    </div>
                </div>
                {state?.capacityUnits != null && (
                    <div className="mt-3">
                        <div className="flex items-center justify-between text-[11px] font-black"><span>Volume na mochila</span><span>{usedUnits.toFixed(1).replace('.', ',').replace(',0', '')} / {state.capacityUnits.toFixed(1).replace('.', ',').replace(',0', '')} un.</span></div>
                        <div className="h-2 rounded-full mt-1 overflow-hidden" style={{ background: 'rgba(255,255,255,0.28)' }}><div className="h-full rounded-full" style={{ width: `${Math.round(vol.ratio * 100)}%`, background: vol.ratio >= 1 ? '#fecaca' : '#fff', transition: 'width .4s' }} /></div>
                    </div>
                )}
                <div className="mt-3 flex items-center justify-between rounded-2xl px-3 py-2" style={{ background: 'rgba(0,0,0,0.22)' }}>
                    <span className="text-[12px] font-bold flex items-center gap-1.5"><Package size={14} /> Quantas entregas cabem na sua mochila?</span>
                    <span className="flex items-center gap-2">
                        <button aria-label="Menos" onClick={() => state && state.capacity > 1 && run('cap', () => setCapacity(userId, state.capacity - 1))} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.25)' }}><Minus size={14} /></button>
                        <b className="w-4 text-center">{state ? state.capacity : '–'}</b>
                        <button aria-label="Mais" onClick={() => state && state.capacity < 8 && run('cap', () => setCapacity(userId, state.capacity + 1))} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.25)' }}><Plus size={14} /></button>
                    </span>
                </div>
                <div className="mt-2 flex items-center justify-between rounded-2xl px-3 py-2" style={{ background: 'rgba(0,0,0,0.22)' }}>
                    <span className="text-[12px] font-bold flex items-center gap-1.5"><Layers size={14} /> Quanto cabe em volume? <span className="opacity-80 font-normal">(1 pizza grande = 1 un.)</span></span>
                    <span className="flex items-center gap-2">
                        <button aria-label="Menos volume" onClick={() => state && run('cap', () => setCapacityUnits(userId as string, state.capacityUnits == null ? null : state.capacityUnits - 1 < 1 ? null : state.capacityUnits - 1))} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.25)' }}><Minus size={14} /></button>
                        <b className="min-w-[2.2rem] text-center text-[12px]">{state ? (state.capacityUnits == null ? 'livre' : `${state.capacityUnits.toFixed(1).replace('.0', '').replace('.', ',')} un.`) : '–'}</b>
                        <button aria-label="Mais volume" onClick={() => state && run('cap', () => setCapacityUnits(userId as string, state.capacityUnits == null ? 4 : state.capacityUnits + 1))} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.25)' }}><Plus size={14} /></button>
                    </span>
                </div>
            </section>

            {/* ===== A saída em andamento ===== */}
            {active.length > 0 && view === 'central' && (
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

                    <DeliveryNavMap me={myPos} store={store} storeName={active[0]?.storeName} stops={navStops} target={navTarget} height={310} voice={state?.voice} colors={colors} onToggleFull={() => setView('map')} />
                    <p className="text-[11px] -mt-1 flex items-center gap-1.5 flex-wrap" style={{ color: colors.textSecondary }}>{ordered.length} parada(s) · ~{routeKm(store, ordered).toFixed(1)} km · ~{etaMinutes(routeKm(store, ordered))} min de rota{optimized && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-black" style={{ background: `${GREEN}22`, color: '#16a34a' }}><Sparkles size={10} /> Rota otimizada{savedKm >= 0.05 ? ` · −${savedKm.toFixed(1).replace('.', ',')} km` : ''}</span>}</p>

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
                            {primaryAction}
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
                                {primaryAction}
                                {isLocalDevOnly() && <button onClick={() => (current.atDoor ? finish(current, true) : arriveDoor(current, true))} className="text-[11px] font-bold underline self-center" style={{ color: colors.textSecondary }}>{current.atDoor ? 'Entreguei (teste)' : 'Estou no local (teste)'}</button>}
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
                {state && !state.online && <p className="rounded-2xl p-3 text-[13px] font-bold mb-3" style={{ background: '#f59e0b22', color: '#b45309' }}>Você está offline. Ative “Online” para receber entregas perto de você.</p>}
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
                                            <p className="text-[11px] font-black mt-0.5" style={{ color: fitsUnits(usedUnits, o.units, state?.capacityUnits ?? null) ? ORANGE : '#ef4444' }}>{loadLabel(o.itemsCount, o.units)}{fitsUnits(usedUnits, o.units, state?.capacityUnits ?? null) ? '' : ' · não cabe na sua mochila'}</p>
                                            {/* ONDE PEGAR e ONDE ENTREGAR, rotulados: é o que o motorista precisa saber antes de aceitar */}
                                            <p className="text-[12px] flex items-center gap-1 mt-1.5 truncate" style={{ color: colors.textPrimary }}><StoreIcon size={11} className="flex-shrink-0" style={{ color: GREEN }} /><b style={{ color: '#16a34a' }}>Retirar</b> {shortAddress(o.storeAddress) || o.storeName}{toStore != null ? ` · a ${toStore.toFixed(1).replace('.', ',')} km de você` : ''}</p>
                                            <p className="text-[12px] flex items-center gap-1 mt-0.5 truncate" style={{ color: colors.textPrimary }}><MapPin size={11} className="flex-shrink-0" style={{ color: ORANGE }} /><b style={{ color: ORANGE }}>Entregar</b> {shortAddress(o.address)}{o.km != null ? ` · ${o.km.toFixed(1).replace('.', ',')} km da loja` : ''}</p>
                                        </div>
                                        <div className="text-right flex-shrink-0"><p className="text-lg font-black leading-none" style={{ color: '#16a34a' }}>{brl(o.price)}</p><p className="text-[10px] mt-1" style={{ color: colors.textSecondary }}>{e ? `~${e} min` : ''}</p></div>
                                    </div>
                                    <div className="mt-3 flex items-center gap-2">
                                        <span className="flex-1" />
                                        <button onClick={() => accept(o)} disabled={!canTakeMore || busy === `o-${o.id}` || !fitsUnits(usedUnits, o.units, state?.capacityUnits ?? null)} className="h-10 px-5 rounded-full text-[13px] font-black text-white flex items-center gap-1.5 transition active:scale-95 disabled:opacity-40" style={{ background: ORANGE }}><Check size={15} strokeWidth={3} /> Aceitar</button>
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

            {/* ===== Avaliações recebidas ===== */}
            {reviews && reviews.count > 0 && (
                <section className="rounded-3xl p-4" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                    <div className="flex items-center justify-between mb-2.5">
                        <div><h2 className="text-base font-black" style={{ color: colors.textPrimary }}>Avaliações recebidas</h2><p className="text-[11px]" style={{ color: colors.textSecondary }}>{reviews.count} {reviews.count === 1 ? 'avaliação' : 'avaliações'} das lojas</p></div>
                        {reviews.avg != null && <span className="flex items-center gap-1 text-lg font-black" style={{ color: '#ca8a04' }}><Star size={18} fill="#eab308" stroke="#eab308" /> {reviews.avg.toFixed(1).replace('.', ',')}</span>}
                    </div>
                    <div className="flex flex-col gap-1.5">{reviews.list.slice(0, 5).map((r) => (
                        <div key={r.id} className="rounded-2xl px-3 py-2" style={{ background: soft }}>
                            <div className="flex items-center gap-1.5"><span className="flex">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={12} fill={n <= r.rating ? '#eab308' : 'none'} stroke={n <= r.rating ? '#eab308' : colors.textSecondary} />)}</span><span className="text-[11px] font-bold truncate" style={{ color: colors.textSecondary }}>{r.reviewerName}</span></div>
                            {r.comment && <p className="text-[12px] mt-0.5" style={{ color: colors.textPrimary }}>“{r.comment}”</p>}
                        </div>
                    ))}</div>
                </section>
            )}

            {/* NAVEGAÇÃO: com uma saída em andamento o foco é o MAPA (tela cheia abaixo da ilha) + uma folha de ação embaixo; Central volta ao resumo e às ofertas */}
            {active.length > 0 && view === 'map' && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-x-0 bottom-0 z-[45] flex flex-col" style={{ top: shellTop, background: colors.background }}>
                    <div className="relative flex-1 min-h-0">
                        <DeliveryNavMap me={myPos} store={store} storeName={active[0]?.storeName} stops={navStops} target={navTarget} height="100%" full voice={state?.voice} colors={colors} />
                        <div className="absolute left-2 flex items-center gap-2" style={{ top: 88 }}>
                            <button onClick={() => setView('central')} className="h-9 px-3 rounded-full text-[12px] font-black flex items-center gap-1.5 shadow-lg bg-white text-slate-800 active:scale-95 transition"><Bike size={14} /> Central</button>
                        </div>
                    </div>
                    <div className="rounded-t-3xl px-4 pt-3 pb-5 flex flex-col gap-2.5 shadow-[0_-8px_24px_rgba(0,0,0,0.18)]" style={{ background: colors.surface, borderTop: `1px solid ${colors.border}` }}>
                        <button onClick={() => setSheetOpen((v) => !v)} className="flex items-center gap-2 text-left" aria-label="Detalhes da entrega">
                            <span className="w-9 h-9 rounded-full flex items-center justify-center text-white font-black flex-shrink-0" style={{ background: navTarget?.kind === 'store' ? GREEN : ORANGE }}>
                                {navTarget?.kind === 'store' ? <StoreIcon size={17} /> : (ordered.findIndex((d) => d.id === current?.id) + 1)}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[10px] font-black uppercase tracking-wide" style={{ color: ORANGE }}>{PHASE_LABEL[phase]} · {phase === 'delivering' ? `entrega ${runDone + 1} de ${runTotal}` : `${active.length} ${active.length === 1 ? 'entrega' : 'entregas'} · ${loadSummary}`}</span>
                                <span className="block text-[15px] font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{phase === 'delivering' && current ? current.customerName : active[0].storeName}</span>
                                <span className="block text-[12px] truncate" style={{ color: colors.textSecondary }}>{phase === 'delivering' && current ? current.address : shortAddress(active[0].storeAddress)}</span>
                                <span className="flex items-center gap-1.5 mt-1">
                                    {phase === 'delivering' && remKm > 0.05 && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full" style={{ background: soft, color: colors.textPrimary }}>faltam {remKm.toFixed(1).replace('.', ',')} km · ~{etaMinutes(remKm)} min</span>}
                                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full" style={{ background: `${GREEN}22`, color: '#16a34a' }}>saída {brl(runEarn)}</span>
                                </span>
                                {phase === 'delivering' && runTotal > 1 && <span className="block h-1 rounded-full mt-1.5 overflow-hidden" style={{ background: soft }}><span className="block h-full rounded-full" style={{ width: `${Math.round((runDone / runTotal) * 100)}%`, background: GREEN, transition: 'width .5s' }} /></span>}
                            </span>
                            {sheetOpen ? <ChevronDown size={20} style={{ color: colors.textSecondary }} /> : <ChevronUp size={20} style={{ color: colors.textSecondary }} />}
                        </button>
                        {sheetOpen && (
                            <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: '34vh' }}>
                                {phase === 'delivering' && current ? (() => {
                                    const pay = paymentRecap(current.paymentMethod, current.cashChangeFor)
                                    return (<>
                                        <ul className="rounded-2xl p-3" style={{ background: soft }}>{itemsList(current.items).map((it, k) => <li key={k} className="text-[12px] flex items-center gap-1.5" style={{ color: colors.textPrimary }}><Package size={11} style={{ color: ORANGE }} />{it}</li>)}</ul>
                                        <div className="rounded-2xl px-3 py-2 text-[12px] font-bold" style={pay.collect ? { background: '#f59e0b22', color: '#b45309' } : { background: `${GREEN}22`, color: '#16a34a' }}>{pay.label}{pay.note ? ` · ${pay.note}` : ''}</div>
                                        {ordered.length > 1 && ordered.slice(1).map((d, i) => (
                                            <div key={d.id} className="flex items-center gap-2.5 rounded-2xl px-3 py-2" style={{ background: soft }}>
                                                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0" style={{ background: `${ORANGE}22`, color: ORANGE }}>{i + 2}</span>
                                                <span className="min-w-0 flex-1"><span className="block text-[12px] font-black truncate" style={{ color: colors.textPrimary }}>{d.customerName}</span><span className="block text-[11px] truncate" style={{ color: colors.textSecondary }}>{shortAddress(d.address)}</span></span>
                                            </div>
                                        ))}
                                    </>)
                                })() : (
                                    <>
                                        <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>Pedidos desta saída</p>
                                        {ordered.map((d, i) => (
                                            <div key={d.id} className="rounded-2xl p-3" style={{ background: soft }}>
                                                <p className="text-[12px] font-black flex items-center justify-between gap-2" style={{ color: colors.textPrimary }}><span className="truncate">{i + 1}. {d.customerName}</span>
                                                    {d.orderStatus == null ? null : d.orderStatus === 'ready' ? <span className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: `${GREEN}22`, color: '#16a34a' }}>Pronto ✓</span> : <span className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: '#f59e0b22', color: '#b45309' }}>Em preparo…</span>}</p>
                                                <ul className="mt-0.5">{itemsList(d.items).map((it, k) => <li key={k} className="text-[12px] flex items-center gap-1.5" style={{ color: colors.textSecondary }}><Check size={11} style={{ color: GREEN }} />{it}</li>)}</ul>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                        )}
                        {primaryAction}
                        <div className="flex items-center gap-2">
                            {navTarget && <a href={wazeUrl(navTarget)} target="_blank" rel="noreferrer" className="flex-1 h-9 rounded-full text-[12px] font-black flex items-center justify-center gap-1.5" style={{ background: '#33ccff33', color: '#0891b2' }}><Navigation size={13} /> Waze</a>}
                            {navTarget && <a href={mapsUrl(navTarget)} target="_blank" rel="noreferrer" className="flex-1 h-9 rounded-full text-[12px] font-black flex items-center justify-center gap-1.5" style={{ background: '#4285f433', color: '#2563eb' }}><MapPin size={13} /> Google Maps</a>}
                            {isLocalDevOnly() && phase === 'delivering' && current && <button onClick={() => (current.atDoor ? finish(current, true) : arriveDoor(current, true))} className="text-[11px] font-bold underline px-1" style={{ color: colors.textSecondary }}>{current.atDoor ? 'Entreguei (teste)' : 'Estou no local (teste)'}</button>}
                        </div>
                    </div>
                </div>, document.body)}
        </div>
    )
}
