'use client'

// "Canal do Motorista" da home 3.0, no molde do card "Social": cabeçalho que abre a página do canal (/canal-do-motorista) e uma grade de
// CORRIDAS ABERTAS — cada uma com o valor, o tempo, a distância, quanto rende por hora e o trajeto (bairro → bairro). Mostra 4 por vez e,
// havendo mais, passa para as próximas a cada 5 s; tocar numa abre a corrida em /aceitar-corridas. Visitante (ride_offers não é público)
// vê o convite para entrar. A conta de cada valor é a regra pura de modules/driver-channel (o R$/h soma 5 min de ir buscar).
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Car, ChevronRight, Flame, Package } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useRideMinimum } from '@/hooks/useRideMinimum'
import { useMyVehicles } from '@/lib/vehicleHeaderTabs'
import type { VehicleKind } from '@/lib/rideVehicle'
import { brl, kmText, loadChannelTiles, type ChannelTile } from '@/modules/driver-channel'

const COLOR = '#16a34a'
const SHOWN = 4
const KIND = {
    valorizada: { label: 'Valorizada', color: '#ea580c', icon: Flame },
    corrida: { label: 'Corrida', color: '#16a34a', icon: Car },
    entrega: { label: 'Entrega', color: '#7c3aed', icon: Package },
} as const

export default function DriverChannelCard() {
    const router = useRouter()
    const { colors } = useTheme()
    const { userId, loading } = useProfile()
    const minPerMinute = useRideMinimum()
    const { vehicles, loaded } = useMyVehicles(userId)
    const [data, setData] = useState<{ tiles: ChannelTile[]; total: number } | null | undefined>(undefined)
    const [tick, setTick] = useState(0)
    const kindsKey = vehicles.map((v) => v.kind).filter(Boolean).sort().join(',')

    useEffect(() => {
        if (loading) return
        if (!userId) { setData(null); return }
        if (!loaded) return
        let alive = true
        const run = () => loadChannelTiles({ minPerMinute, myKinds: (kindsKey ? kindsKey.split(',') : []) as VehicleKind[] }).then((d) => { if (alive) setData(d) })
        run()
        const t = setInterval(() => { if (!document.hidden) run() }, 30000)
        return () => { alive = false; clearInterval(t) }
    }, [loading, userId, loaded, kindsKey, minPerMinute])

    useEffect(() => {
        if (!data || data.tiles.length <= SHOWN) return
        const t = setInterval(() => { if (!document.hidden) setTick((n) => n + 1) }, 5000)
        return () => clearInterval(t)
    }, [data])

    const list = data?.tiles || []
    const start = list.length > SHOWN ? (tick * SHOWN) % list.length : 0
    const shown = list.length <= SHOWN ? list : Array.from({ length: SHOWN }, (_, i) => list[(start + i) % list.length])
    const soft = `${colors.border}40`
    const sub = data === null && !userId ? 'Veja quanto dá para ganhar dirigindo'
        : data && data.total > 0 ? `${data.total} ${data.total === 1 ? 'corrida aberta' : 'corridas abertas'} agora · valor, tempo e distância`
            : 'Corridas, entregas e quanto cada uma paga'

    return (
        <div className="col-span-2 md:col-span-4 rounded-3xl border" style={{ background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}>
            <button onClick={() => router.push('/canal-do-motorista')} className="w-full p-3.5 flex items-center gap-3 text-left transition active:opacity-80">
                <span className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${COLOR}1f`, color: COLOR }}><Car size={22} /></span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-black leading-tight" style={{ color: colors.textPrimary }}>Canal do Motorista</span>
                    <span className="block text-xs mt-0.5 leading-snug" style={{ color: colors.textSecondary }}>{sub}</span>
                </span>
                <span className="flex items-center gap-0.5 text-xs font-black flex-shrink-0" style={{ color: COLOR }}>Abrir <ChevronRight size={14} /></span>
            </button>

            {data === undefined ? (
                <div className="px-3.5 pb-3.5 grid grid-cols-2 gap-2.5">
                    {[0, 1, 2, 3].map((i) => <div key={i} className="h-[86px] rounded-2xl animate-pulse" style={{ background: soft }} />)}
                </div>
            ) : data === null ? (
                !userId && (
                    <div className="px-3.5 pb-3.5">
                        <button onClick={() => router.push('/login')} className="w-full rounded-2xl p-3 text-left text-[12.5px] font-bold" style={{ background: soft, color: colors.textPrimary }}>
                            Entre para ver as corridas abertas agora e quanto cada uma paga <span style={{ color: COLOR }}>→</span>
                        </button>
                    </div>
                )
            ) : shown.length === 0 ? (
                <div className="px-3.5 pb-3.5">
                    <p className="rounded-2xl p-3 text-[12.5px]" style={{ background: soft, color: colors.textSecondary }}>Nenhuma corrida aberta agora. Quando chegar, aparece aqui com o valor.</p>
                </div>
            ) : (
                <div className="px-3.5 pb-3.5 grid grid-cols-2 md:grid-cols-4 gap-2.5">
                    {shown.map((t, i) => {
                        const k = KIND[t.kind]
                        const Icon = k.icon
                        return (
                            <button key={`${t.id}-${tick}-${i}`} onClick={() => router.push(t.href)} className="driver-in min-w-0 rounded-2xl p-2.5 text-left transition active:scale-[0.98]" style={{ background: t.kind === 'valorizada' ? `${k.color}14` : soft, border: t.kind === 'valorizada' ? `1px solid ${k.color}55` : '1px solid transparent' }}>
                                <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide" style={{ color: k.color }}>
                                    <Icon size={12} />{t.kind === 'corrida' ? t.vehicle : k.label}
                                </span>
                                <span className="block mt-1 leading-none" style={{ color: colors.textPrimary }}>
                                    {t.approx && <span className="text-[10px] font-bold mr-1" style={{ color: colors.textSecondary }}>a partir de</span>}
                                    <span className="text-[18px] font-black">{brl(t.value)}</span>
                                </span>
                                <span className="block text-[11px] font-bold mt-1 truncate" style={{ color: colors.textPrimary }}>
                                    {[t.minutes ? `${t.minutes} min` : '', kmText(t.km)].filter(Boolean).join(' · ')}
                                    {t.perHour ? <span style={{ color: COLOR }}> · ≈ R$ {t.perHour}/h</span> : null}
                                </span>
                                <span className="block text-[11px] truncate mt-0.5" style={{ color: colors.textSecondary }}>{t.route}</span>
                            </button>
                        )
                    })}
                </div>
            )}
            <style jsx>{`
                .driver-in { animation: driverIn .4s ease both; }
                @keyframes driverIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
                @media (prefers-reduced-motion: reduce) { .driver-in { animation: none; } }
            `}</style>
        </div>
    )
}
