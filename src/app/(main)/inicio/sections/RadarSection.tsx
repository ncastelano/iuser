// src/app/(main)/inicio/sections/RadarSection.tsx
'use client'

import { ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Radar as Navigation, Store, ShoppingBag, Wrench, MapPin, Eye, Users } from 'lucide-react'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { fetchNearest, formatDistance, type NearestItem, type NearestKind } from '@/lib/radarNearest'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface RadarSectionProps {
    dragHandle?: ReactNode
    // Local da pessoa ("Definir local" do perfil); sem ele não dá pra saber o que está perto
    origin?: { lat: number; lng: number } | null
    // Dono do que está logado: o que é dele não aparece nos cards
    userId?: string | null
    // Abre o seletor de local (logado: salva no perfil; visitante: salva neste aparelho)
    onDefineLocation?: () => void
}

const KIND_META: Record<NearestKind, { label: string; icon: typeof Store }> = {
    loja: { label: 'Loja', icon: Store },
    produto: { label: 'Produto', icon: ShoppingBag },
    servico: { label: 'Serviço', icon: Wrench },
    pessoa: { label: 'Pessoa', icon: Users },
}

const KINDS: NearestKind[] = ['loja', 'produto', 'servico', 'pessoa']

// Banner de destaque pro Radar — antes só existia como botão flutuante
// (continua existindo, não mexi nele); isso aqui é o mesmo atalho com mais
// espaço pra explicar o que é, igual ao banner do /modelodehomepage.
export default function RadarSection({ dragHandle, origin, userId, onDefineLocation }: RadarSectionProps) {
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const [nearest, setNearest] = useState<Record<NearestKind, NearestItem[]> | null>(null)
    // Qual dos (até) 3 de cada tipo está na tela; troca sozinho a cada 5 segundos
    const [tick, setTick] = useState(0)
    // Quantos de cada tipo cabem na tela: 1 no celular (grade 2×2: loja e produto em cima, serviço e pessoa embaixo), 2 no tablet (8) e 3 no desktop (12)
    const [perKind, setPerKind] = useState(1)
    useEffect(() => {
        const update = () => setPerKind(window.innerWidth >= 1280 ? 3 : window.innerWidth >= 640 ? 2 : 1)
        update()
        window.addEventListener('resize', update)
        return () => window.removeEventListener('resize', update)
    }, [])

    const lat = origin?.lat
    const lng = origin?.lng
    // Sem local definido mostra os mais vistos; assim que houver local, troca pros mais próximos.
    useEffect(() => {
        let cancelled = false
        setNearest(null)
        fetchNearest(lat != null && lng != null ? { lat, lng } : null, userId)
            .then((res) => { if (!cancelled) setNearest(res) })
            .catch(() => { if (!cancelled) setNearest({ loja: [], produto: [], servico: [], pessoa: [] }) })
        return () => { cancelled = true }
    }, [lat, lng, userId])

    useEffect(() => {
        if (!nearest) return
        const rotates = KINDS.some((k) => nearest[k].length > perKind)
        if (!rotates) return
        const timer = setInterval(() => setTick((t) => t + 1), 5000)
        return () => clearInterval(timer)
    }, [nearest, perKind])

    // Até `perKind` cards de cada tipo (loja, produto, serviço); se tem mais do que cabe, a janela gira a cada 5 s
    const cards = nearest
        ? KINDS.flatMap((k) => {
            const list = nearest[k]
            const n = Math.min(perKind, list.length)
            return Array.from({ length: n }, (_, i) => list[(tick + i) % list.length])
        })
        : []
    const goRadar = () => { startNavProgress(); router.push('/radar') }

    return (
        <section>
            {dragHandle && <div className="flex mb-2">{dragHandle}</div>}
            <div
                onClick={goRadar}
                role="link"
                aria-label="Abrir o radar"
                className="relative rounded-3xl p-6 overflow-hidden cursor-pointer"
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
                        0%, 100% { border-width: 1px; opacity: 0.22; }
                        35% { border-width: 5px; opacity: 0.75; }
                        65% { border-width: 2px; opacity: 0.4; }
                    }
                    @keyframes radarDot {
                        0%, 100% { transform: scale(1); box-shadow: 0 0 10px #f97316; }
                        50% { transform: scale(1.35); box-shadow: 0 0 22px #f97316; }
                    }
                    @keyframes radarCardIn {
                        0% { opacity: 0; transform: translateY(10px) scale(0.94); }
                        100% { opacity: 1; transform: translateY(0) scale(1); }
                    }
                    .radar-card-in { animation: radarCardIn 0.55s ease-out; }
                    .radar-ring { animation: radarRing 2.7s ease-in-out infinite; }
                    .radar-dot { animation: radarDot 2.7s ease-in-out infinite; }
                    @media (prefers-reduced-motion: reduce) {
                        .radar-ring, .radar-dot, .radar-card-in { animation: none; }
                        .radar-ring { border-width: 2px; opacity: 0.4; }
                    }
                `}</style>

                <div className="relative z-10 max-w-[75%] sm:max-w-[65%]">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-white/60">iUser</span>
                    </div>
                    <h3 className="text-xl font-black text-white mb-1.5">Radar</h3>
                    <p className="text-sm text-white/70">
                        Veja quem e o que tem perto de você agora — lojas, pessoas e ofertas em tempo real.
                    </p>
                </div>

                {/* Os mais perto de você: uma loja, um produto, um serviço e uma pessoa */}
                <div className="relative z-10 mt-5">
                    {nearest == null ? (                        <div className="grid grid-cols-2 sm:grid-cols-4 min-[1280px]:grid-cols-6 gap-3">
                            {Array.from({ length: perKind * 4 }).map((_, i) => <div key={i} className="aspect-square rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />)}
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center flex-wrap gap-x-2 gap-y-2 mb-4">
                                <p className="text-[10px] font-black uppercase tracking-wider text-white/50">
                                    {origin ? 'Mais perto de você' : 'Mais vistos'}
                                    {!origin && <span className="normal-case font-semibold tracking-normal text-white/40"> · defina seu local no topo pra ver os mais próximos</span>}
                                </p>
                                {/* Só enquanto não há local definido; com local, o Radar já mostra o que está perto */}
                                {onDefineLocation && !origin && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onDefineLocation() }}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-full font-bold text-xs text-white transition-all hover:scale-105 active:scale-95"
                                        style={{ background: GRADIENT, boxShadow: '0 4px 14px #f9731650' }}
                                    >
                                        <MapPin size={12} />
                                        Definir local
                                    </button>
                                )}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 min-[1280px]:grid-cols-6 gap-3">
                                {cards.map((item) => {
                                    const { label, icon: KindIcon } = KIND_META[item.kind]
                                    return (
                                        // Wrapper sem overflow cortado: o selo do tipo fica pendurado na borda de cima do card
                                        // (lado direito), como o selo do "Seu plano", em vez de dentro da imagem em cima do preço.
                                        <div key={`${item.kind}-${item.id}`} className="relative radar-card-in">
                                        <span
                                            className="absolute -top-2.5 right-2 z-10 flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full text-white whitespace-nowrap pointer-events-none"
                                            style={{ background: '#111827', border: '1px solid #ffffff' }}
                                        >
                                            <KindIcon size={10} color="#ffffff" />
                                            {label}
                                        </span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); startNavProgress(); router.push(item.href) }}
                                            className="group relative block w-full overflow-hidden rounded-xl aspect-square text-left transition-all hover:scale-[1.03] active:scale-95"
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

                                            <div className="absolute bottom-0 left-0 right-0 p-2 pointer-events-none">
                                                <h4 className="text-[11px] font-bold text-white leading-tight line-clamp-2">{item.name}</h4>
                                                {item.subtitle && <p className="text-[9px] text-white/60 truncate">{item.subtitle}</p>}
                                                {item.kind === 'produto' && item.price != null && (
                                                    <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-black text-white" style={{ background: 'rgba(249,115,22,0.85)' }}>
                                                        R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </span>
                                                )}
                                                <div className="flex items-center gap-1 mt-0.5">
                                                    {item.distanceKm != null ? (
                                                        <>
                                                            <MapPin size={10} className="text-white/70" />
                                                            <span className="text-[10px] font-semibold text-white/70">{formatDistance(item.distanceKm)}</span>
                                                        </>
                                                    ) : item.kind === 'pessoa' ? (
                                                        <span className="text-[10px] font-semibold text-white/70">⭐ {item.points || 0} pts</span>
                                                    ) : (
                                                        <>
                                                            <Eye size={10} className="text-white/70" />
                                                            <span className="text-[10px] font-semibold text-white/70">{item.viewCount} {item.viewCount === 1 ? 'visita' : 'visitas'}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </button>
                                        </div>
                                    )
                                })}
                            </div>
                            {cards.length === 0 && (
                                <p className="text-xs text-white/60">Nada com localização por perto ainda.</p>
                            )}
                        </>
                    )}
                </div>

                {/* Abrir radar, embaixo do "mais perto de você" */}
                <div className="relative z-10 mt-4 flex justify-end gap-2">
                    <button
                        onClick={(e) => { e.stopPropagation(); goRadar() }}
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
