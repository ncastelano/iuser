// src/app/(main)/inicio/sections/RadarSection.tsx
'use client'

import { ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Radar as RadarIcon, Navigation, Store, ShoppingBag, Wrench, MapPin } from 'lucide-react'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { fetchNearest, formatDistance, type NearestItem, type NearestKind } from '@/lib/radarNearest'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface RadarSectionProps {
    dragHandle?: ReactNode
    // Local da pessoa ("Definir local" do perfil); sem ele não dá pra saber o que está perto
    origin?: { lat: number; lng: number } | null
}

const KIND_META: Record<NearestKind, { label: string; icon: typeof Store }> = {
    loja: { label: 'Loja', icon: Store },
    produto: { label: 'Produto', icon: ShoppingBag },
    servico: { label: 'Serviço', icon: Wrench },
}

// Banner de destaque pro Radar — antes só existia como botão flutuante
// (continua existindo, não mexi nele); isso aqui é o mesmo atalho com mais
// espaço pra explicar o que é, igual ao banner do /modelodehomepage.
export default function RadarSection({ dragHandle, origin }: RadarSectionProps) {
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const [nearest, setNearest] = useState<Partial<Record<NearestKind, NearestItem>> | null>(null)

    const lat = origin?.lat
    const lng = origin?.lng
    useEffect(() => {
        if (lat == null || lng == null) { setNearest(null); return }
        let cancelled = false
        fetchNearest({ lat, lng })
            .then((res) => { if (!cancelled) setNearest(res) })
            .catch(() => { if (!cancelled) setNearest({}) })
        return () => { cancelled = true }
    }, [lat, lng])

    const cards = nearest ? (['loja', 'produto', 'servico'] as NearestKind[]).map((k) => nearest[k]).filter(Boolean) as NearestItem[] : []

    return (
        <section>
            {dragHandle && <div className="flex mb-2">{dragHandle}</div>}
            <div
                className="relative rounded-3xl p-6 overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #111827, #1f2937)', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}
            >
                {/* Anéis do radar, decorativos */}
                <div className="absolute -right-6 sm:right-6 top-1/2 -translate-y-1/2 pointer-events-none">
                    {[140, 100, 60].map((size, i) => (
                        <div
                            key={size}
                            className="absolute rounded-full border"
                            style={{
                                width: size, height: size,
                                left: -size / 2, top: -size / 2,
                                borderColor: `rgba(249,115,22,${0.35 - i * 0.08})`,
                            }}
                        />
                    ))}
                    <div className="absolute w-3 h-3 rounded-full" style={{ left: -6, top: -6, background: GRADIENT, boxShadow: '0 0 16px #f97316' }} />
                </div>

                <div className="relative z-10 max-w-[75%] sm:max-w-[65%]">
                    <div className="flex items-center gap-2 mb-2">
                        <RadarIcon size={20} color="#f97316" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-white/60">iUser</span>
                    </div>
                    <h3 className="text-xl font-black text-white mb-1.5">Radar</h3>
                    <p className="text-sm text-white/70 mb-4">
                        Veja quem e o que tem perto de você agora — lojas, pessoas e ofertas em tempo real.
                    </p>
                    <button
                        onClick={() => { startNavProgress(); router.push('/radar') }}
                        className="flex items-center gap-1.5 px-5 py-2.5 rounded-full font-bold text-sm text-white transition-all hover:scale-105 active:scale-95"
                        style={{ background: GRADIENT, boxShadow: '0 4px 14px #f9731650' }}
                    >
                        <Navigation size={14} />
                        Abrir radar
                    </button>
                </div>

                {/* Os 3 mais perto de você: uma loja, um produto e um serviço */}
                <div className="relative z-10 mt-5">
                    {origin == null ? (
                        <p className="text-xs text-white/60 flex items-center gap-1.5">
                            <MapPin size={12} /> Defina seu local (no topo da página) para ver o que tem perto de você.
                        </p>
                    ) : nearest == null ? (
                        <div className="grid grid-cols-3 gap-2">
                            {[0, 1, 2].map((i) => <div key={i} className="h-32 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />)}
                        </div>
                    ) : (
                        <>
                            <p className="text-[10px] font-black uppercase tracking-wider text-white/50 mb-2">Mais perto de você</p>
                            <div className="grid grid-cols-3 gap-2">
                                {cards.map((item) => {
                                    const { label, icon: KindIcon } = KIND_META[item.kind]
                                    return (
                                        <button
                                            key={item.kind}
                                            onClick={() => { startNavProgress(); router.push(item.href) }}
                                            className="text-left rounded-2xl overflow-hidden transition-all hover:scale-[1.03] active:scale-95"
                                            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
                                        >
                                            <div className="relative aspect-[4/3] w-full" style={{ background: item.imageUrl ? '#0b1220' : GRADIENT }}>
                                                {item.imageUrl ? (
                                                    <img src={item.imageUrl} alt={item.name} loading="lazy" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center"><KindIcon size={26} color="rgba(255,255,255,0.85)" /></div>
                                                )}
                                                <span className="absolute left-1.5 top-1.5 flex items-center gap-1 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full text-white" style={{ background: 'rgba(0,0,0,0.55)' }}>
                                                    <KindIcon size={9} />
                                                    {label}
                                                </span>
                                            </div>
                                            <div className="p-2">
                                                <p className="text-[11px] font-black text-white leading-tight line-clamp-2">{item.name}</p>
                                                {item.subtitle && <p className="text-[9px] text-white/50 truncate mt-0.5">{item.subtitle}</p>}
                                                <p className="text-[10px] font-black mt-1 flex items-center gap-1" style={{ color: '#fb923c' }}>
                                                    <MapPin size={10} />
                                                    {formatDistance(item.distanceKm)}
                                                </p>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                            {cards.length === 0 && (
                                <p className="text-xs text-white/60">Nada com localização por perto ainda.</p>
                            )}
                        </>
                    )}
                </div>
            </div>
        </section>
    )
}
