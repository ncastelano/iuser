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
    // Dono do que está logado: o que é dele não aparece nos cards
    userId?: string | null
}

const KIND_META: Record<NearestKind, { label: string; icon: typeof Store }> = {
    loja: { label: 'Loja', icon: Store },
    produto: { label: 'Produto', icon: ShoppingBag },
    servico: { label: 'Serviço', icon: Wrench },
}

// Banner de destaque pro Radar — antes só existia como botão flutuante
// (continua existindo, não mexi nele); isso aqui é o mesmo atalho com mais
// espaço pra explicar o que é, igual ao banner do /modelodehomepage.
export default function RadarSection({ dragHandle, origin, userId }: RadarSectionProps) {
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const [nearest, setNearest] = useState<Partial<Record<NearestKind, NearestItem>> | null>(null)

    const lat = origin?.lat
    const lng = origin?.lng
    useEffect(() => {
        if (lat == null || lng == null) { setNearest(null); return }
        let cancelled = false
        fetchNearest({ lat, lng }, userId)
            .then((res) => { if (!cancelled) setNearest(res) })
            .catch(() => { if (!cancelled) setNearest({}) })
        return () => { cancelled = true }
    }, [lat, lng, userId])

    const cards = nearest ? (['loja', 'produto', 'servico'] as NearestKind[]).map((k) => nearest[k]).filter(Boolean) as NearestItem[] : []

    return (
        <section>
            {dragHandle && <div className="flex mb-2">{dragHandle}</div>}
            <div
                className="relative rounded-3xl p-6 overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #111827, #1f2937)', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}
            >
                {/* Anéis do radar, decorativos: no celular o centro fica na borda direita,
                    então os círculos aparecem cortados ao meio (efeito de radar saindo do card) */}
                <div className="absolute right-0 sm:right-6 top-[92px] -translate-y-1/2 pointer-events-none">
                    {/* A espessura da borda "viaja" de fora pra dentro: cada anel engrossa e afina
                        um instante depois do anterior, como o pulso de um radar */}
                    {[200, 140, 84].map((size, i) => (
                        <div
                            key={size}
                            className="absolute rounded-full radar-ring"
                            style={{
                                width: size, height: size,
                                left: -size / 2, top: -size / 2,
                                borderStyle: 'solid',
                                borderColor: '#f97316',
                                animationDelay: `${i * 0.9}s`,
                            }}
                        />
                    ))}
                    <div className="absolute w-3 h-3 rounded-full radar-dot" style={{ left: -6, top: -6, background: GRADIENT, boxShadow: '0 0 16px #f97316' }} />
                </div>
                <style>{`
                    @keyframes radarRing {
                        0%, 100% { border-width: 1px; opacity: 0.2; filter: blur(0.5px); box-shadow: 0 0 5px rgba(249,115,22,0.2); }
                        35% { border-width: 5px; opacity: 0.65; filter: blur(1.2px); box-shadow: 0 0 14px rgba(249,115,22,0.4); }
                        65% { border-width: 2px; opacity: 0.35; filter: blur(0.8px); box-shadow: 0 0 8px rgba(249,115,22,0.28); }
                    }
                    @keyframes radarDot {
                        0%, 100% { transform: scale(1); box-shadow: 0 0 10px #f97316; }
                        50% { transform: scale(1.35); box-shadow: 0 0 22px #f97316; }
                    }
                    .radar-ring { animation: radarRing 2.7s ease-in-out infinite; }
                    .radar-dot { animation: radarDot 2.7s ease-in-out infinite; }
                    @media (prefers-reduced-motion: reduce) {
                        .radar-ring, .radar-dot { animation: none; }
                        .radar-ring { border-width: 2px; opacity: 0.35; filter: blur(0.8px); }
                    }
                `}</style>

                <div className="relative z-10 max-w-[75%] sm:max-w-[65%]">
                    <div className="flex items-center gap-2 mb-2">
                        <RadarIcon size={20} color="#f97316" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-white/60">iUser</span>
                    </div>
                    <h3 className="text-xl font-black text-white mb-1.5">Radar</h3>
                    <p className="text-sm text-white/70">
                        Veja quem e o que tem perto de você agora — lojas, pessoas e ofertas em tempo real.
                    </p>
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
                                            className="group relative block overflow-hidden rounded-xl aspect-square text-left transition-all hover:scale-[1.03] active:scale-95"
                                            style={{ border: '1px solid rgba(255,255,255,0.3)' }}
                                        >
                                            {/* Imagem do tamanho do card inteiro */}
                                            {item.imageUrl ? (
                                                <img src={item.imageUrl} alt={item.name} loading="lazy" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                            ) : (
                                                <div className="absolute inset-0 flex items-center justify-center" style={{ background: GRADIENT }}>
                                                    <KindIcon size={34} color="rgba(255,255,255,0.8)" strokeWidth={1.5} />
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

                                            {/* Tipo: botão laranja → vermelho, texto e ícone brancos */}
                                            <span
                                                className="absolute top-1.5 left-1.5 flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wide text-white pointer-events-none"
                                                style={{ background: GRADIENT, boxShadow: '0 2px 6px rgba(249,115,22,0.4)' }}
                                            >
                                                <KindIcon size={10} color="#ffffff" />
                                                {label}
                                            </span>

                                            <div className="absolute bottom-0 left-0 right-0 p-2 pointer-events-none">
                                                <h4 className="text-[11px] font-bold text-white leading-tight line-clamp-2">{item.name}</h4>
                                                {item.subtitle && <p className="text-[9px] text-white/60 truncate">{item.subtitle}</p>}
                                                {item.kind === 'produto' && item.price != null && (
                                                    <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-black text-white" style={{ background: 'rgba(249,115,22,0.85)' }}>
                                                        R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </span>
                                                )}
                                                <div className="flex items-center gap-1 mt-0.5">
                                                    <MapPin size={10} className="text-white/70" />
                                                    <span className="text-[10px] font-semibold text-white/70">{formatDistance(item.distanceKm)}</span>
                                                </div>
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

                {/* Abrir radar: embaixo do "mais perto de você", no lado direito */}
                <div className="relative z-10 mt-4 flex justify-end">
                    <button
                        onClick={() => { startNavProgress(); router.push('/radar') }}
                        className="flex items-center gap-1.5 px-5 py-2.5 rounded-full font-bold text-sm text-white transition-all hover:scale-105 active:scale-95"
                        style={{ background: GRADIENT, boxShadow: '0 4px 14px #f9731650' }}
                    >
                        <Navigation size={14} />
                        Abrir radar
                    </button>
                </div>
            </div>
        </section>
    )
}
