// src/components/radar/RadarDriverDetails.tsx
//
// Corpo do card de um MOTORISTA no /radar: o mesmo que o cliente vê em iuser.com.br/<vehicleSlug> (disponibilidade, números, quem é, o que o
// veículo oferece, quanto custa a corrida e as corridas recentes com o que disseram), no estilo claro do card do radar. Só apresentação + leituras
// públicas: os dados do motorista chegam do RPC get_radar_drivers (RadarScreen) e as corridas recentes de get_driver_recent_rides (que já
// devolve só o bairro). O botão principal ("Chamar para corrida") fica no rodapé do card do RadarScreen.
'use client'

import { useEffect, useMemo, useState } from 'react'
import { Baby, Calendar, ChevronRight, Luggage, Route, Star, Users, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { DRIVER_SERVICE_OPTIONS, driverServiceLabel } from '@/lib/driverServices'
import { loadPlatformTariffs } from '@/lib/platformTariffs'
import { computeSuggestedPrice, getEffectivePricing } from '@/lib/driverPricing'
import type { RadarDriverItem } from '@/lib/radarDrivers'

const KIND_LABEL: Record<string, string> = { carro: 'Carro', moto: 'Moto', bicicleta: 'Bicicleta' }

const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
// Trajeto sem expor o endereço exato: só o bairro (tira rua, número e CEP)
const coarseAddress = (a: string | null): string => {
    if (!a) return 'um local'
    const parts = a.split(',').map((x) => x.trim()).filter((x) => x && !/^\d+([-\s]\d+)?$/.test(x))
    if (parts.length >= 3) return parts[1]
    return (parts[0] || '').replace(/\d+/g, '').replace(/\s+/g, ' ').trim() || 'um local'
}

export type { RadarDriverItem }

interface Recent { at: string; km: number | null; from: string; to: string; rating: number | null; comment: string | null; who: string | null }

export default function RadarDriverDetails({ item, go }: { item: RadarDriverItem; go: (path: string) => void }) {
    const [recent, setRecent] = useState<Recent[]>([])
    const [tariffsReady, setTariffsReady] = useState(false)

    useEffect(() => {
        let cancelled = false
        // a tarifa da plataforma vem do banco: sempre carregar antes de calcular preço
        loadPlatformTariffs(supabase).then(() => { if (!cancelled) setTariffsReady(true) })
        setRecent([])
        supabase.rpc('get_driver_recent_rides', { p_driver: item.id, p_limit: 3 }).then(({ data }) => {
            if (cancelled) return
            setRecent(((data as any[]) || []).map((r) => ({
                at: r.rode_at,
                km: r.distance_km != null ? Number(r.distance_km) : null,
                from: coarseAddress(r.origin_address),
                to: coarseAddress(r.destination_address),
                rating: r.rating != null ? Number(r.rating) : null,
                comment: r.comment || null,
                who: r.reviewer_name || (r.reviewer_slug ? `@${r.reviewer_slug}` : null),
            })))
        })
        return () => { cancelled = true }
    }, [item.id])

    const pricing = useMemo(() => (tariffsReady ? getEffectivePricing(item.pricingRow, item.kind) : null), [tariffsReady, item.pricingRow, item.kind])
    const examples = pricing ? [3, 5, 10, 20].map((km) => ({ km, price: computeSuggestedPrice(km, pricing) })) : []
    const since = item.memberSince
        ? `${new Date(item.memberSince).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}/${String(new Date(item.memberSince).getFullYear()).slice(2)}`
        : '—'

    const sizes = (label: string, [p, m, g]: [number, number, number]) => {
        const parts = [p ? `${p} P` : null, m ? `${m} M` : null, g ? `${g} G` : null].filter(Boolean)
        return parts.length ? `${label} ${parts.join(' · ')}` : null
    }
    const facts = [
        item.capacity != null ? { icon: <Users size={12} />, text: `${item.capacity} ${item.capacity === 1 ? 'passageiro' : 'passageiros'}` } : null,
        item.kind === 'carro' && item.babySeat ? { icon: <Baby size={12} />, text: 'Cadeirinha' } : null,
        sizes('Bolsas', item.trunk.bags) ? { icon: <Luggage size={12} />, text: sizes('Bolsas', item.trunk.bags)! } : null,
        sizes('Malas', item.trunk.cases) ? { icon: <Luggage size={12} />, text: sizes('Malas', item.trunk.cases)! } : null,
    ].filter(Boolean) as { icon: React.ReactNode; text: string }[]

    const stat = (icon: React.ReactNode, value: string, label: string) => (
        <div className="flex-1 min-w-0 rounded-xl bg-gray-50 px-2.5 py-2">
            <span className="flex items-center gap-1 text-[13px] font-black text-gray-900 leading-tight">
                <span className="text-orange-500 flex-shrink-0">{icon}</span><span className="truncate">{value}</span>
            </span>
            <span className="block text-[9.5px] text-gray-500 leading-tight mt-0.5 truncate">{label}</span>
        </div>
    )

    return (
        <div className="px-4 pb-3 space-y-3">
            {/* Disponibilidade e veículo */}
            <div className="flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full text-white bg-green-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Disponível agora
                </span>
                <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full text-white bg-orange-500">{KIND_LABEL[item.kind] || 'Veículo'}</span>
            </div>

            {/* Números: nota, corridas, desde quando */}
            <div className="flex gap-2">
                {stat(<Star size={13} className="fill-current" />, item.rating != null && item.ratingCount > 0 ? item.rating.toFixed(1).replace('.', ',') : 'Novo', item.ratingCount > 0 ? `${item.ratingCount} ${item.ratingCount === 1 ? 'avaliação' : 'avaliações'}` : 'sem avaliações')}
                {stat(<Route size={13} />, String(item.rides), item.rides === 1 ? 'corrida' : 'corridas')}
                {stat(<Calendar size={13} />, since, 'no iUser')}
            </div>

            {/* Quem é o motorista */}
            {item.profileSlug && (
                <button type="button" onClick={() => go(`/${item.profileSlug}`)} className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left bg-gray-50 hover:bg-gray-100 transition-colors">
                    <span className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center text-white font-black" style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)' }}>
                        {item.avatarUrl
                            ? <img src={item.avatarUrl} className="w-full h-full object-cover" alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                            : item.profileSlug.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[10px] text-gray-500 leading-none">Motorista</span>
                        <span className="block text-xs font-black text-gray-900 truncate">{item.name}</span>
                        <span className="block text-[10px] text-gray-500 truncate">@{item.profileSlug}</span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                </button>
            )}

            {/* O veículo tem */}
            {(item.services.length > 0 || facts.length > 0) && (
                <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-gray-400 mb-2">O veículo tem</p>
                    <div className="flex flex-wrap gap-1.5">
                        {item.services.map((sv) => {
                            const Icon = DRIVER_SERVICE_OPTIONS.find((o) => o.id === sv)?.icon
                            return (
                                <span key={sv} className="px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 bg-orange-50 text-orange-600">
                                    {Icon && <Icon size={11} className="flex-shrink-0" />}{driverServiceLabel(sv)}
                                </span>
                            )
                        })}
                        {facts.map((f, i) => (
                            <span key={i} className="px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 bg-gray-100 text-gray-700">
                                <span className="flex-shrink-0 text-gray-500">{f.icon}</span>{f.text}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Quanto custa */}
            {pricing && (
                <div className="rounded-xl bg-green-50 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-black text-gray-900">
                        <Wallet size={14} className="text-green-600" /> Quanto custa a corrida
                        <span className="ml-auto text-[11px] font-black text-green-700">a partir de {brl(pricing.baseFee)}</span>
                    </p>
                    <div className="mt-2 grid grid-cols-4 gap-1.5">
                        {examples.map((e) => (
                            <div key={e.km} className="rounded-lg bg-white px-1.5 py-1.5 text-center">
                                <span className="block text-[9px] text-gray-500 leading-tight">{e.km} km</span>
                                <span className="block text-[11px] font-black text-gray-900 leading-tight">{brl(Math.round(e.price * 100) / 100)}</span>
                            </div>
                        ))}
                    </div>
                    <p className="text-[9px] text-gray-500 mt-1.5">Valores de referência: o preço final aparece quando você pede.</p>
                </div>
            )}

            {/* Corridas recentes, com o que disseram */}
            {recent.length > 0 && (
                <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-gray-400 mb-2">Corridas recentes</p>
                    <div className="space-y-2">
                        {recent.map((r, i) => (
                            <div key={i} className="bg-gray-50 rounded-xl p-2.5">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-[10px] font-bold text-gray-800 min-w-0">{r.from} <span className="text-gray-400 font-normal">para</span> {r.to}</p>
                                    <span className="text-[9px] text-gray-500 flex-shrink-0">
                                        {new Date(r.at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')}
                                        {r.km != null ? ` · ${r.km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : ''}
                                    </span>
                                </div>
                                <p className="text-[10px] text-gray-600 mt-0.5">
                                    {r.rating != null && <span className="font-black text-yellow-600 inline-flex items-center gap-0.5 mr-1"><Star size={9} className="fill-yellow-500 text-yellow-500" />{r.rating}</span>}
                                    {r.comment ? <>“{r.comment}”{r.who ? <span className="font-bold"> — {r.who}</span> : null}</> : (r.rating != null ? 'sem comentário' : 'Ainda sem avaliação')}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <button type="button" onClick={() => go(`/${item.vehicleSlug}`)} className="w-full text-center text-[11px] font-black uppercase tracking-wide text-orange-600 hover:underline">
                Ver a página do veículo
            </button>
        </div>
    )
}
