'use client'

// As páginas de BUSCA DO LOCAL do /pedir-motorista (11/11/2026, decisão do dono): além do campo, mostram sem precisar digitar
//   • atalhos: "Minha localização" e "Marcar no mapa";
//   • SEUS LUGARES RECENTES (partidas e chegadas que a pessoa já usou);
//   • EMPRESAS DO iUSER por perto (lojas com endereço público).
// Só a página de CHEGADA mostra VALOR (`priceFrom` = a partida): a ESTIMATIVA da corrida da partida até cada lugar, com a MESMA conta do
// card do motorista (modules/ride-places → lib/rideQuote): distância e TEMPO reais pelas ruas (Mapbox Matrix, uma consulta para todos os
// lugares da tela), o deslocamento do motorista ativo MAIS PERTO da partida (sem ninguém: 3 km ≈ R$ 6), a Tarifa iUser do VEÍCULO escolhido
// (Carro · Moto · Bicicleta, trocável aqui mesmo) e os mínimos (R$ 40 por hora de trabalho e o mínimo de uma corrida). Na PARTIDA não há
// valor: a pessoa sai dali.
// Ao digitar, os resultados da busca (que a tela desenha em cima) continuam aparecendo e estas listas embaixo passam a mostrar só o que bate
// com o texto. A posição e o endereço das lojas são colunas PÚBLICAS de `stores` (o comércio é público; nada de pessoa aqui).
import { useEffect, useMemo, useState } from 'react'
import { Crosshair, History, Map as MapIcon, Store as StoreIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import { loadPlatformTariffs } from '@/lib/platformTariffs'
import { computePickupFee, computeSuggestedPrice, PLATFORM_DEFAULT_PRICING_BY_VEHICLE, type DriverPricing } from '@/lib/driverPricing'
import { loadMinRideFare } from '@/modules/negotiation'
import { useRideMinimum } from '@/hooks/useRideMinimum'
import { haversineKm, legFromKm, matches, placeQuote, roadKm, type Leg } from '@/modules/ride-places'

export interface PlacePick { address: string; coords: [number, number] | null }

interface StoreSpot { id: string; name: string; address: string; coords: [number, number]; logoUrl: string | null; category: string | null }

const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`
const short = (a: string) => a.split(',').slice(0, 2).join(',').trim()
export type VehicleKindChoice = 'carro' | 'moto' | 'bicicleta'
const ptKey = (c: [number, number]) => `${c[0].toFixed(5)},${c[1].toFixed(5)}`

/** distância e tempo REAIS pelas ruas de `from` até cada destino (e do motorista até `from`), numa consulta só ao Mapbox Matrix (até 25 pontos).
 *  Falhou: null (quem chama cai na linha reta). Guarda por chave para não repetir ao digitar. */
const matrixCache = new Map<string, { legs: Record<string, Leg>; pickup: Leg | null } | null>()
async function fetchMatrix(from: [number, number], dests: [number, number][], driver: [number, number] | null, kind: VehicleKindChoice) {
    const key = `${kind}|${ptKey(from)}|${driver ? ptKey(driver) : ''}|${dests.map(ptKey).join(';')}`
    if (matrixCache.has(key)) return matrixCache.get(key)!
    const coords = [from, ...(driver ? [driver] : []), ...dests]
    const destStart = driver ? 2 : 1
    const profile = kind === 'bicicleta' ? 'cycling' : 'driving'
    const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/${profile}/${coords.map((c) => `${c[0]},${c[1]}`).join(';')}`
        + `?sources=${driver ? '0;1' : '0'}&destinations=${[...(driver ? [0] : []), ...dests.map((_, i) => destStart + i)].join(';')}&annotations=distance,duration&access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`
    try {
        const r = await fetch(url)
        const j = await r.json()
        if (!r.ok || j.code !== 'Ok') throw new Error(j.message || 'matrix')
        const off = driver ? 1 : 0   // com o motorista, a 1ª coluna é a partida
        const legs: Record<string, Leg> = {}
        dests.forEach((d, i) => {
            const m = j.distances?.[0]?.[off + i], sec = j.durations?.[0]?.[off + i]
            if (m != null && sec != null) legs[ptKey(d)] = { km: m / 1000, min: sec / 60 }
        })
        const pm = driver ? j.distances?.[1]?.[0] : null, ps = driver ? j.durations?.[1]?.[0] : null
        const out = { legs, pickup: pm != null && ps != null ? { km: pm / 1000, min: ps / 60 } : null }
        matrixCache.set(key, out)
        return out
    } catch { matrixCache.set(key, null); return null }
}

export default function PlaceSearchExtras({ query, refPoint, priceFrom, vehicleKind = 'carro', onVehicleKind, pickupFrom = null, recents, locating, onUseMyLocation, onPickOnMap, onPick }: {
    query: string
    /** onde a pessoa está (o centro do mapa): de onde se mede "perto" */
    refPoint: [number, number] | null
    /** página de CHEGADA: mostra o valor estimado da corrida a partir daqui (a partida; null = ainda sem partida: vale o mínimo, também com "±").
     *  undefined = página de PARTIDA: sem valores */
    priceFrom?: [number, number] | null
    /** o veículo da estimativa (o mesmo do pedido; trocar aqui troca lá) */
    vehicleKind?: VehicleKindChoice
    onVehicleKind?: (k: VehicleKindChoice) => void
    /** onde está o motorista ativo mais perto da partida (do tipo escolhido); null = ninguém por perto (vale 3 km) */
    pickupFrom?: [number, number] | null
    recents: PlacePick[]
    locating: boolean
    onUseMyLocation: () => void
    onPickOnMap: () => void
    onPick: (p: PlacePick) => void
}) {
    const { colors } = useTheme()
    const [stores, setStores] = useState<StoreSpot[] | null>(null)
    const [, setTariffTick] = useState(0)
    const minPerMinute = useRideMinimum()

    // a tarifa e o mínimo da corrida vêm do banco (Admin → Tarifas)
    useEffect(() => { void Promise.all([loadPlatformTariffs(supabase), loadMinRideFare()]).then(() => setTariffTick((n) => n + 1)).catch(() => {}) }, [])

    // empresas com endereço perto da pessoa (as ~200 mais próximas numa caixa de ~15 km; a ordem é feita aqui)
    const refKey = refPoint ? `${refPoint[0].toFixed(2)},${refPoint[1].toFixed(2)}` : ''
    useEffect(() => {
        let alive = true
        const run = async () => {
            let q = supabase.from('stores').select('id, name, address, store_address, store_lat, store_lng, logo_url, category')
                .eq('is_active', true).not('store_lat', 'is', null).not('store_lng', 'is', null).limit(200)
            if (refPoint) q = q.gte('store_lng', refPoint[0] - 0.14).lte('store_lng', refPoint[0] + 0.14).gte('store_lat', refPoint[1] - 0.14).lte('store_lat', refPoint[1] + 0.14)
            const { data } = await q
            if (!alive) return
            const list: StoreSpot[] = ((data || []) as any[]).map((s) => ({
                id: s.id, name: s.name, address: s.store_address || s.address || '', coords: [Number(s.store_lng), Number(s.store_lat)] as [number, number],
                logoUrl: s.logo_url ? supabase.storage.from('store-logos').getPublicUrl(s.logo_url).data.publicUrl : null, category: s.category,
            }))
            if (refPoint) list.sort((a, b) => haversineKm(refPoint, a.coords) - haversineKm(refPoint, b.coords))
            setStores(list)
        }
        void run().catch(() => { if (alive) setStores([]) })
        return () => { alive = false }
        // refPoint por valor arredondado: o mapa mexendo um pouco não refaz a busca
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refKey])

    const typing = query.trim().length > 0
    const recentList = useMemo(() => recents.filter((r) => matches(r.address, query)).slice(0, 8), [recents, query, typing])
    // na CHEGADA, o lugar da própria partida (a menos de 100 m dela) não é destino
    const storeList = useMemo(() => (stores || []).filter((s) => matches(`${s.name} ${s.address} ${s.category || ''}`, query) && !(priceFrom && haversineKm(priceFrom, s.coords) < 0.1)).slice(0, typing ? 5 : 8), [stores, query, typing, priceFrom])
    const showPrice = priceFrom !== undefined

    // a rota de verdade (distância e tempo) da partida até cada lugar da tela, e do motorista mais perto até a partida
    const [matrix, setMatrix] = useState<{ legs: Record<string, Leg>; pickup: Leg | null } | null>(null)
    const destPts = useMemo(() => {
        const seen = new Set<string>()
        const pts: [number, number][] = []
        for (const c of [...recentList.map((r) => r.coords), ...(stores || []).slice(0, 14).map((st) => st.coords)]) {
            if (!c || seen.has(ptKey(c))) continue
            seen.add(ptKey(c)); pts.push(c)
        }
        return pts.slice(0, 22)
    }, [recentList, stores])
    const destKey = destPts.map(ptKey).join(';')
    useEffect(() => {
        if (!showPrice || !priceFrom || destPts.length === 0) { setMatrix(null); return }
        let alive = true
        void fetchMatrix(priceFrom, destPts, pickupFrom, vehicleKind).then((m) => { if (alive) setMatrix(m) })
        return () => { alive = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showPrice, priceFrom?.[0], priceFrom?.[1], pickupFrom?.[0], pickupFrom?.[1], destKey, vehicleKind])

    const shape = PLATFORM_DEFAULT_PRICING_BY_VEHICLE[vehicleKind]
    const pickupLeg: Leg | null = matrix?.pickup ?? (pickupFrom && priceFrom ? legFromKm(roadKm(pickupFrom, priceFrom) ?? 0) : null)
    const estimate = (place: [number, number] | null) => {
        const trip: Leg | null = !priceFrom || !place ? null : matrix?.legs[ptKey(place)] ?? legFromKm(roadKm(priceFrom, place) ?? 0)
        return placeQuote<DriverPricing>({
            trip, pickup: pickupLeg, shape, minPerMinute,
            tripFare: (sh, km) => (km != null ? computeSuggestedPrice(km, sh, 'pessoa') : sh.baseFee + sh.extraFees.pessoa),
            pickupFee: (sh, km) => computePickupFee(sh, km),
        })
    }

    const row = (key: string, icon: React.ReactNode, title: string, sub: string, place: PlacePick) => {
        const est = estimate(place.coords)
        return (
            <button key={key} type="button" onClick={() => onPick(place)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors active:bg-black/5">
                {icon}
                <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-bold truncate" style={{ color: colors.textPrimary }}>{title}</span>
                    {sub && <span className="block text-[11.5px] truncate" style={{ color: colors.textSecondary }}>{sub}</span>}
                </span>
                {showPrice && place.coords && (
                    <span className="text-right flex-shrink-0">
                        <span className="block text-[13px] font-black tabular-nums" style={{ color: '#16a34a' }}>± {brl(est.value)}</span>
                    </span>
                )}
            </button>
        )
    }

    return (
        <div className="pb-6">
            {/* atalhos */}
            <div className="grid grid-cols-2 gap-2 px-4 pt-3">
                <button type="button" onClick={onUseMyLocation} className="h-11 rounded-2xl flex items-center justify-center gap-2 text-[13px] font-black active:scale-95 transition" style={{ background: '#22c55e1a', color: '#16a34a' }}>
                    {locating ? <Spinner size={15} /> : <Crosshair size={16} />}Minha localização
                </button>
                <button type="button" onClick={onPickOnMap} className="h-11 rounded-2xl flex items-center justify-center gap-2 text-[13px] font-black active:scale-95 transition" style={{ background: `${colors.border}30`, color: colors.textPrimary }}>
                    <MapIcon size={16} />Marcar no mapa
                </button>
            </div>

            {recentList.length > 0 && (
                <section className="mt-4">
                    <p className="px-4 mb-1.5 text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>Seus lugares recentes</p>
                    {/* fileira HORIZONTAL de cartõezinhos (ocupa uma altura só); na chegada cada um leva o valor estimado */}
                    <div className="flex gap-2 overflow-x-auto px-4 pb-1 snap-x scroll-pl-4" style={{ scrollbarWidth: 'none' }}>
                        {recentList.map((r) => {
                            const est = estimate(r.coords)
                            const [title, ...rest] = r.address.split(/ — |,/).map((x) => x.trim()).filter(Boolean)
                            return (
                                <button key={`r-${r.address}`} type="button" onClick={() => onPick(r)} className="snap-start flex-shrink-0 w-[170px] rounded-2xl px-3 py-2 text-left active:scale-[0.98] transition" style={{ background: `${colors.border}30` }}>
                                    <span className="flex items-center gap-1.5">
                                        <History size={12} className="flex-shrink-0" style={{ color: colors.textSecondary }} />
                                        <span className="text-[12.5px] font-bold truncate" style={{ color: colors.textPrimary }}>{title}</span>
                                    </span>
                                    <span className="block text-[11px] truncate mt-0.5" style={{ color: colors.textSecondary }}>{rest.slice(0, 2).join(', ') || ' '}</span>
                                    {showPrice && r.coords && <span className="block text-[12px] font-black tabular-nums mt-0.5" style={{ color: '#16a34a' }}>± {brl(est.value)}</span>}
                                </button>
                            )
                        })}
                    </div>
                </section>
            )}

            <section className="mt-4">
                <p className="px-4 mb-1 text-[11px] font-black uppercase tracking-wide flex items-center justify-between gap-2" style={{ color: colors.textSecondary }}>
                    <span>Empresas do iUser {refPoint ? 'por perto' : ''}</span>
                    {showPrice && (onVehicleKind ? (
                        <span className="normal-case tracking-normal flex items-center gap-1" role="radiogroup" aria-label="Veículo da estimativa">
                            {(['carro', 'moto', 'bicicleta'] as VehicleKindChoice[]).map((k) => (
                                <button key={k} type="button" role="radio" aria-checked={vehicleKind === k} onClick={() => onVehicleKind(k)}
                                    className="h-6 px-2 rounded-full text-[10.5px] font-black" style={vehicleKind === k ? { background: '#f97316', color: '#fff' } : { background: `${colors.border}40`, color: colors.textSecondary }}>
                                    {k === 'carro' ? 'Carro' : k === 'moto' ? 'Moto' : 'Bike'}
                                </button>
                            ))}
                        </span>
                    ) : <span className="normal-case tracking-normal font-semibold">valor estimado</span>)}
                </p>
                {stores === null ? (
                    <div className="flex justify-center py-4"><Spinner size={18} color={colors.textSecondary} /></div>
                ) : storeList.length === 0 ? (
                    <p className="px-4 py-2 text-[12px]" style={{ color: colors.textSecondary }}>{typing ? 'Nenhuma empresa com esse nome por perto.' : 'Nenhuma empresa do iUser com endereço por perto.'}</p>
                ) : storeList.map((s) => {
                    const km = refPoint ? haversineKm(refPoint, s.coords) : null
                    return row(`s-${s.id}`,
                        s.logoUrl
                            ? <img src={s.logoUrl} alt="" className="w-9 h-9 rounded-xl object-cover flex-shrink-0" />
                            : <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#f9731622' }}><StoreIcon size={16} style={{ color: '#ea580c' }} /></span>,
                        s.name, [short(s.address), km != null ? `${km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace('.', ',')} km`}${priceFrom ? ' da partida' : ''}` : ''].filter(Boolean).join(' · '),
                        { address: `${s.name} — ${s.address}`, coords: s.coords })
                })}
                {showPrice && (storeList.length > 0 || recentList.length > 0) && (
                    <p className="px-4 pt-1 text-[10.5px]" style={{ color: colors.textSecondary }}>
                        Valor estimado {vehicleKind === 'moto' ? 'de moto' : vehicleKind === 'bicicleta' ? 'de bicicleta' : 'de carro'}: {priceFrom ? `a corrida da sua partida até lá${matrix ? ' pelas ruas' : ''}` : 'escolha a partida para ver o valor certo; por enquanto, o mínimo'} + o deslocamento do motorista {pickupLeg ? `mais perto (${pickupLeg.km.toFixed(1).replace('.', ',')} km)` : '(≈ 3 km, ninguém por perto agora)'}, nunca abaixo de R$ {Math.round(minPerMinute * 60)} por hora de trabalho. O valor de verdade sai no pedido.
                    </p>
                )}
            </section>
        </div>
    )
}
