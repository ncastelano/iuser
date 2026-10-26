// src/components/v3/NearbyAroundCard.tsx
//
// "Ver ao redor" da home 3.0: em vez de só chamar o mapa, mostra um de cada coisa que existe perto — loja, produto, serviço
// e pessoa — com a distância. Tocar num item abre ele; tocar no título abre o radar (o mapa). Mesma fonte do Radar da home
// 2.0 (`fetchNearest`; os 3 mais perto de cada tipo, que se alternam a cada 5 s): sem local definido mostra os mais vistos e avisa que dá para ver o mais perto definindo o local.
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Briefcase, ChevronRight, Home, MapPin, Package, Radar, Store as StoreIcon, User, Wrench } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { fetchNearest, formatDistance, type NearestItem, type NearestKind } from '@/lib/radarNearest'

const DEVICE_LOCATION_KEY = 'iuser_device_location'
const COLOR = '#0891b2'
const KINDS: { kind: NearestKind; label: string; icon: typeof StoreIcon; color: string }[] = [
    { kind: 'loja', label: 'Loja', icon: StoreIcon, color: '#2563eb' },
    { kind: 'produto', label: 'Produto', icon: Package, color: '#059669' },
    { kind: 'servico', label: 'Serviço', icon: Wrench, color: '#7c3aed' },
    { kind: 'pessoa', label: 'Pessoa', icon: User, color: '#db2777' },
    { kind: 'imovel', label: 'Aluguel', icon: Home, color: '#16a34a' },
    { kind: 'pedido', label: 'Pedido de serviço', icon: Briefcase, color: '#ea580c' },
]

export default function NearbyAroundCard({ userId }: { userId: string | null }) {
    const router = useRouter()
    const { colors } = useTheme()
    const [origin, setOrigin] = useState<{ lat: number; lng: number } | null | undefined>(undefined)
    const [nearest, setNearest] = useState<Record<NearestKind, NearestItem[]> | null>(null)
    // Qual dos (até) 3 de cada tipo está na tela: todos pulam para o próximo a cada 5 segundos
    const [tick, setTick] = useState(0)

    // Onde a pessoa está: o endereço salvo no perfil; visitante, o local definido neste aparelho
    useEffect(() => {
        let cancelled = false
        const done = (o: { lat: number; lng: number } | null) => { if (!cancelled) setOrigin(o) }
        if (!userId) {
            try {
                const p = JSON.parse(localStorage.getItem(DEVICE_LOCATION_KEY) || 'null')
                done(p && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? { lat: p.lat, lng: p.lng } : null)
            } catch { done(null) }
        } else {
            supabase.from('my_profile').select('store_lat, store_lng').eq('id', userId).maybeSingle().then(({ data }) => {
                const r = data as { store_lat: number | null; store_lng: number | null } | null
                done(r?.store_lat != null && r?.store_lng != null ? { lat: Number(r.store_lat), lng: Number(r.store_lng) } : null)
            })
        }
        return () => { cancelled = true }
    }, [userId])

    useEffect(() => {
        if (origin === undefined) return
        let cancelled = false
        fetchNearest(origin, userId)
            
            .then((res) => { if (!cancelled) setNearest(res) })
            .catch(() => { if (!cancelled) setNearest({ loja: [], produto: [], servico: [], pessoa: [], imovel: [], pedido: [] }) })
        return () => { cancelled = true }
    }, [origin, userId])

    useEffect(() => {
        if (!nearest || !KINDS.some((k) => nearest[k.kind].length > 1)) return
        const t = setInterval(() => { if (!document.hidden) setTick((n) => n + 1) }, 5000)
        return () => clearInterval(t)
    }, [nearest])
    const items = nearest ? KINDS.filter((k) => nearest[k.kind].length > 0).map((k) => nearest[k.kind][tick % nearest[k.kind].length]) : null

    const soft = `${colors.border}40`

    return (
        <div className="col-span-2 md:col-span-4 rounded-3xl border" style={{ background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}>
            <button onClick={() => router.push('/radar')} className="w-full p-3.5 flex items-center gap-3 text-left transition active:opacity-80">
                <span className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${COLOR}1f`, color: COLOR }}><Radar size={22} /></span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-black leading-tight" style={{ color: colors.textPrimary }}>Ver ao redor</span>
                    <span className="block text-xs mt-0.5 leading-snug" style={{ color: colors.textSecondary }}>
                        {origin ? 'O que tem perto de você agora' : origin === null ? 'Mais vistos · defina seu local para ver o mais perto' : 'Procurando ao redor...'}
                    </span>
                </span>
                <span className="flex items-center gap-0.5 text-xs font-black flex-shrink-0" style={{ color: COLOR }}>Mapa <ChevronRight size={14} /></span>
            </button>

            {items === null || origin === undefined ? (
                <div className="px-3.5 pb-3.5 flex gap-2.5 overflow-hidden">
                    {[0, 1, 2].map((i) => <div key={i} className="flex-shrink-0 w-[152px] h-[66px] rounded-2xl animate-pulse" style={{ background: soft }} />)}
                </div>
            ) : items.length > 0 && (
                <div className="px-3.5 pb-3.5 flex gap-2.5 overflow-x-auto snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {items.map((it) => {
                        const meta = KINDS.find((k) => k.kind === it.kind)!
                        const Icon = meta.icon
                        return (
                            <button
                                key={it.kind + it.id}
                                onClick={() => router.push(it.href)}
                                className="nearby-in snap-start flex-shrink-0 w-[168px] rounded-2xl p-2 flex items-center gap-2.5 text-left transition active:scale-[0.98]"
                                style={{ background: soft }}
                            >
                                <span className={`w-12 h-12 overflow-hidden flex-shrink-0 flex items-center justify-center ${it.kind === 'pessoa' ? 'rounded-full' : 'rounded-xl'}`} style={{ background: `${meta.color}22`, color: meta.color }}>
                                    {it.imageUrl ? <img src={it.imageUrl} alt="" loading="lazy" className="w-full h-full object-cover" /> : <Icon size={20} />}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[10px] font-black uppercase tracking-wide" style={{ color: meta.color }}>{meta.label}</span>
                                    <span className="block text-[13px] font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{it.name}</span>
                                    {(it.kind === 'imovel' || it.kind === 'pedido') && it.subtitle && <span className="block text-[11px] truncate" style={{ color: colors.textSecondary }}>{it.subtitle}</span>}
                                    {it.distanceKm != null
                                        ? <span className="flex items-center gap-0.5 text-[11px]" style={{ color: colors.textSecondary }}><MapPin size={10} />{formatDistance(it.distanceKm)}</span>
                                        : it.price != null ? <span className="block text-[11px] font-bold" style={{ color: colors.textSecondary }}>R$ {it.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span> : null}
                                </span>
                            </button>
                        )
                    })}
                </div>
            )}
            <style jsx>{`
                .nearby-in { animation: nearbyIn .4s ease both; }
                @keyframes nearbyIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
                @media (prefers-reduced-motion: reduce) { .nearby-in { animation: none; } }
            `}</style>
        </div>
    )
}
